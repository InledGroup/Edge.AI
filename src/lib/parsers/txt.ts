// TXT Parser - Simple text file parser
// Handles plain text files with encoding detection

/**
 * Parse a plain text file
 * Returns the text content as a string
 */
export async function parseTxtFile(file: File): Promise<string> {
  try {
    console.log(`📄 Parsing TXT file: ${file.name} (${file.size} bytes)`);

    // Read file as text
    const text = await file.text();

    // Basic cleaning
    const cleaned = cleanText(text);

    console.log(`✅ Parsed ${cleaned.length} characters from TXT`);

    return cleaned;
  } catch (error) {
    console.error('❌ Failed to parse TXT file:', error);
    throw new Error(
      `Failed to parse TXT file: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Clean and normalize text
 */
function cleanText(text: string): string {
  // Normalize line breaks
  let cleaned = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Remove excessive whitespace
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n'); // Max 2 consecutive newlines

  // Trim each line
  cleaned = cleaned
    .split('\n')
    .map(line => line.trim())
    .join('\n');

  // Remove leading/trailing whitespace
  cleaned = cleaned.trim();

  return cleaned;
}

/**
 * Validate if file is a text file
 */
export function isTxtFile(file: File): boolean {
  const txtExtensions = ['.txt', '.text'];
  const fileName = file.name.toLowerCase();

  return txtExtensions.some(ext => fileName.endsWith(ext)) ||
         file.type === 'text/plain';
}
