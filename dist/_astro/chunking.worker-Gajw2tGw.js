function semanticChunkText(text, targetSize = 800, minSize = 400) {
  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const paragraphs = text.split(/\n\n+/).map((p) => p.trim()).filter((p) => p.length > 0);
  const chunks = [];
  let currentChunk = [];
  let currentSize = 0;
  for (let i = 0; i < paragraphs.length; i++) {
    const paragraph = paragraphs[i];
    const paragraphSize = paragraph.length;
    detectParagraphType(paragraph);
    if (paragraphSize > targetSize * 1.5) {
      if (currentChunk.length > 0) {
        chunks.push(createChunk(currentChunk, chunks.length));
        currentChunk = [];
        currentSize = 0;
      }
      const sentences = splitIntoSentences(paragraph);
      let sentenceChunk = [];
      let sentenceSize = 0;
      for (const sentence of sentences) {
        if (sentenceSize + sentence.length > targetSize && sentenceChunk.length > 0) {
          chunks.push(createChunk(sentenceChunk, chunks.length));
          sentenceChunk = [sentenceChunk[sentenceChunk.length - 1], sentence];
          sentenceSize = sentenceChunk[0].length + sentence.length;
        } else {
          sentenceChunk.push(sentence);
          sentenceSize += sentence.length;
        }
      }
      if (sentenceChunk.length > 0) {
        chunks.push(createChunk(sentenceChunk, chunks.length));
      }
      continue;
    }
    if (currentSize + paragraphSize > targetSize && currentChunk.length > 0) {
      chunks.push(createChunk(currentChunk, chunks.length));
      if (currentChunk.length > 0) {
        currentChunk = [currentChunk[currentChunk.length - 1], paragraph];
        currentSize = currentChunk[0].length + paragraphSize;
      } else {
        currentChunk = [paragraph];
        currentSize = paragraphSize;
      }
    } else {
      currentChunk.push(paragraph);
      currentSize += paragraphSize;
    }
  }
  if (currentChunk.length > 0) {
    chunks.push(createChunk(currentChunk, chunks.length));
  }
  return chunks.map((chunk, i) => ({
    ...chunk,
    metadata: {
      ...chunk.metadata,
      totalChunks: chunks.length,
      prevContext: i > 0 ? getLastSentence(chunks[i - 1].content) : void 0,
      nextContext: i < chunks.length - 1 ? getFirstSentence(chunks[i + 1].content) : void 0
    }
  }));
}
function createChunk(paragraphs, index) {
  const content = paragraphs.join("\n\n");
  const type = detectParagraphType(content);
  return {
    content,
    metadata: {
      type,
      index,
      totalChunks: 0
      // Will be set later
    }
  };
}
function detectParagraphType(text) {
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 1 && lines[0].length < 100 && !lines[0].endsWith(".")) {
    return "heading";
  }
  const listLines = lines.filter((l) => /^[\-\*\•\d]+[\.\)]\s/.test(l.trim()));
  if (listLines.length > 0) {
    return listLines.length === lines.length ? "list" : "mixed";
  }
  return "paragraph";
}
function splitIntoSentences(text) {
  return text.split(/([.!?]+[\s\n]+)/).reduce((acc, part, i, arr) => {
    if (i % 2 === 0 && part.trim()) {
      const sentence = part + (arr[i + 1] || "");
      acc.push(sentence.trim());
    }
    return acc;
  }, []).filter((s) => s.length > 0);
}
function getFirstSentence(text) {
  const sentences = splitIntoSentences(text);
  return sentences[0] || text.substring(0, 150);
}
function getLastSentence(text) {
  const sentences = splitIntoSentences(text);
  return sentences[sentences.length - 1] || text.substring(Math.max(0, text.length - 150));
}

self.onmessage = async (event) => {
  const { id, type, payload } = event.data;
  try {
    switch (type) {
      case "chunk-document": {
        await handleChunkDocument(
          id,
          payload.documentId,
          payload.text,
          payload.chunkSize,
          payload.overlap
        );
        break;
      }
      default:
        sendError(id, `Unknown message type: ${type}`);
    }
  } catch (error) {
    sendError(id, error instanceof Error ? error.message : "Unknown error");
  }
};
async function handleChunkDocument(id, documentId, text, chunkSize = 800, overlap = 50) {
  try {
    sendProgress(id, 10, "Iniciando chunking...");
    const semanticChunks = semanticChunkText(text, chunkSize);
    sendProgress(id, 50, `Creados ${semanticChunks.length} chunks`);
    const chunks = semanticChunks.map((sc, index) => ({
      documentId,
      content: sc.content,
      index,
      tokens: estimateTokens(sc.content),
      metadata: {
        startChar: sc.metadata.startChar,
        endChar: sc.metadata.endChar,
        type: sc.metadata.type,
        prevContext: sc.metadata.prevContext,
        nextContext: sc.metadata.nextContext
      }
    }));
    sendProgress(id, 90, "Finalizando...");
    sendSuccess(id, { chunks });
  } catch (error) {
    sendError(id, `Failed to chunk document: ${error}`);
  }
}
function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}
function sendSuccess(id, payload) {
  const response = {
    id,
    type: "success",
    payload
  };
  self.postMessage(response);
}
function sendError(id, error) {
  const response = {
    id,
    type: "error",
    error
  };
  self.postMessage(response);
}
function sendProgress(id, progress, message) {
  const response = {
    id,
    type: "progress",
    progress,
    message
  };
  self.postMessage(response);
}
