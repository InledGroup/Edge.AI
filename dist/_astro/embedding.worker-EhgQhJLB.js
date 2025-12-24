const joinBuffers = (buffers) => {
  const totalSize = buffers.reduce((acc, buf) => acc + buf.length, 0);
  const output = new Uint8Array(totalSize);
  output.set(buffers[0], 0);
  for (let i = 1; i < buffers.length; i++) {
    output.set(buffers[i], buffers[i - 1].length);
  }
  return output;
};
const textDecoder = new TextDecoder();
const bufToText = (buffer) => {
  return textDecoder.decode(buffer);
};
const maybeSortFileByName = (blobs) => {
  const isFiles = blobs.every((b) => !!b.name);
  if (isFiles) {
    const files = blobs;
    files.sort((a, b) => a.name.localeCompare(b.name));
  }
};
const absoluteUrl = (relativePath) => new URL(relativePath, document.baseURI).href;
const padDigits = (number, digits) => {
  return Array(Math.max(digits - String(number).length + 1, 0)).join("0") + number;
};
const isSupportMultiThread = () => (async (e) => {
  try {
    return "undefined" != typeof MessageChannel && new MessageChannel().port1.postMessage(new SharedArrayBuffer(1)), WebAssembly.validate(e);
  } catch (e2) {
    return false;
  }
})(
  new Uint8Array([
    0,
    97,
    115,
    109,
    1,
    0,
    0,
    0,
    1,
    4,
    1,
    96,
    0,
    0,
    3,
    2,
    1,
    0,
    5,
    4,
    1,
    3,
    1,
    1,
    10,
    11,
    1,
    9,
    0,
    65,
    0,
    254,
    16,
    2,
    0,
    26,
    11
  ])
);
const isSupportExceptions = async () => WebAssembly.validate(
  new Uint8Array([
    0,
    97,
    115,
    109,
    1,
    0,
    0,
    0,
    1,
    4,
    1,
    96,
    0,
    0,
    3,
    2,
    1,
    0,
    10,
    8,
    1,
    6,
    0,
    6,
    64,
    25,
    11,
    11
  ])
);
const isSupportSIMD = async () => WebAssembly.validate(
  new Uint8Array([
    0,
    97,
    115,
    109,
    1,
    0,
    0,
    0,
    1,
    5,
    1,
    96,
    0,
    1,
    123,
    3,
    2,
    1,
    0,
    10,
    10,
    1,
    8,
    0,
    65,
    0,
    253,
    15,
    253,
    98,
    11
  ])
);
const checkEnvironmentCompatible = async () => {
  if (!await isSupportExceptions()) {
    throw new Error("WebAssembly runtime does not support exception handling");
  }
  if (!await isSupportSIMD()) {
    throw new Error("WebAssembly runtime does not support SIMD");
  }
};
const isSafari = () => {
  return isSafariMobile() || !!navigator.userAgent.match(/Version\/([0-9\._]+).*Safari/);
};
const isSafariMobile = () => {
  return !!navigator.userAgent.match(/Version\/([0-9\._]+).*Mobile.*Safari.*/);
};

const MEMFS_PATCH_TO_HEAPFS = `
const fsNameToFile = {};  // map Name => File
const fsIdToFile = {};    // map ID => File
let currFileId = 0;

// Patch and redirect memfs calls to wllama
const patchMEMFS = () => {
  const m = wModule;
  // save functions
  m.MEMFS.stream_ops._read = m.MEMFS.stream_ops.read;
  m.MEMFS.stream_ops._write = m.MEMFS.stream_ops.write;
  m.MEMFS.stream_ops._llseek = m.MEMFS.stream_ops.llseek;
  m.MEMFS.stream_ops._allocate = m.MEMFS.stream_ops.allocate;
  m.MEMFS.stream_ops._mmap = m.MEMFS.stream_ops.mmap;
  m.MEMFS.stream_ops._msync = m.MEMFS.stream_ops.msync;

  const patchStream = (stream) => {
    const name = stream.node.name;
    if (fsNameToFile[name]) {
      const f = fsNameToFile[name];
      stream.node.contents = m.HEAPU8.subarray(f.ptr, f.ptr + f.size);
      stream.node.usedBytes = f.size;
    }
  };

  // replace "read" functions
  m.MEMFS.stream_ops.read = function (stream, buffer, offset, length, position) {
    patchStream(stream);
    return m.MEMFS.stream_ops._read(stream, buffer, offset, length, position);
  };
  m.MEMFS.ops_table.file.stream.read = m.MEMFS.stream_ops.read;

  // replace "llseek" functions
  m.MEMFS.stream_ops.llseek = function (stream, offset, whence) {
    patchStream(stream);
    return m.MEMFS.stream_ops._llseek(stream, offset, whence);
  };
  m.MEMFS.ops_table.file.stream.llseek = m.MEMFS.stream_ops.llseek;

  // replace "mmap" functions
  m.MEMFS.stream_ops.mmap = function (stream, length, position, prot, flags) {
    patchStream(stream);
    const name = stream.node.name;
    if (fsNameToFile[name]) {
      const f = fsNameToFile[name];
      return {
        ptr: f.ptr + position,
        allocated: false,
      };
    } else {
      return m.MEMFS.stream_ops._mmap(stream, length, position, prot, flags);
    }
  };
  m.MEMFS.ops_table.file.stream.mmap = m.MEMFS.stream_ops.mmap;

  // mount FS
  m.FS.mkdir('/models');
  m.FS.mount(m.MEMFS, { root: '.' }, '/models');
};

// Allocate a new file in wllama heapfs, returns file ID
const heapfsAlloc = (name, size) => {
  if (size < 1) {
    throw new Error('File size must be bigger than 0');
  }
  const m = wModule;
  const ptr = m.mmapAlloc(size);
  const file = {
    ptr: ptr,
    size: size,
    id: currFileId++,
  };
  fsIdToFile[file.id] = file;
  fsNameToFile[name] = file;
  return file.id;
};

// Add new file to wllama heapfs, return number of written bytes
const heapfsWrite = (id, buffer, offset) => {
  const m = wModule;
  if (fsIdToFile[id]) {
    const { ptr, size } = fsIdToFile[id];
    const afterWriteByte = offset + buffer.byteLength;
    if (afterWriteByte > size) {
      throw new Error(\`File ID \${id} write out of bound, afterWriteByte = \${afterWriteByte} while size = \${size}\`);
    }
    m.HEAPU8.set(buffer, ptr + offset);
    return buffer.byteLength;
  } else {
    throw new Error(\`File ID \${id} not found in heapfs\`);
  }
};
`;
const WORKER_UTILS = `
// send message back to main thread
const msg = (data) => postMessage(data);

// Convert CPP log into JS log
const cppLogToJSLog = (line) => {
  const matched = line.match(/@@(DEBUG|INFO|WARN|ERROR)@@(.*)/);
  return !!matched
    ? {
      level: (matched[1] === 'INFO' ? 'debug' : matched[1]).toLowerCase(),
      text: matched[2],
    }
    : { level: 'log', text: line };
};

// Get module config that forwards stdout/err to main thread
const getWModuleConfig = (pathConfig, pthreadPoolSize) => {
  if (!pathConfig['wllama.js']) {
    throw new Error('"wllama.js" is missing in pathConfig');
  }
  return {
    noInitialRun: true,
    print: function (text) {
      if (arguments.length > 1) text = Array.prototype.slice.call(arguments).join(' ');
      msg({ verb: 'console.log', args: [text] });
    },
    printErr: function (text) {
      if (arguments.length > 1) text = Array.prototype.slice.call(arguments).join(' ');
      const logLine = cppLogToJSLog(text);
      msg({ verb: 'console.' + logLine.level, args: [logLine.text] });
    },
    locateFile: function (filename, basePath) {
      const p = pathConfig[filename];
      const truncate = (str) => str.length > 128 ? \`\${str.substr(0, 128)}...\` : str;
      msg({ verb: 'console.debug', args: [\`Loading "\${filename}" from "\${truncate(p)}"\`] });
      return p;
    },
    mainScriptUrlOrBlob: pathConfig['wllama.js'],
    pthreadPoolSize,
    wasmMemory: pthreadPoolSize > 1 ? getWasmMemory() : null,
    onAbort: function (text) {
      msg({ verb: 'signal.abort', args: [text] });
    },
  };
};

// Get the memory to be used by wasm. (Only used in multi-thread mode)
// Because we have a weird OOM issue on iOS, we need to try some values
// See: https://github.com/emscripten-core/emscripten/issues/19144
//      https://github.com/godotengine/godot/issues/70621
const getWasmMemory = () => {
  let minBytes = 128 * 1024 * 1024;
  let maxBytes = 4096 * 1024 * 1024;
  let stepBytes = 128 * 1024 * 1024;
  while (maxBytes > minBytes) {
    try {
      const wasmMemory = new WebAssembly.Memory({
        initial: minBytes / 65536,
        maximum: maxBytes / 65536,
        shared: true,
      });
      return wasmMemory;
    } catch (e) {
      maxBytes -= stepBytes;
      continue; // retry
    }
  }
  throw new Error('Cannot allocate WebAssembly.Memory');
};
`;
const WORKER_CODE$1 = `
// Start the main llama.cpp
let wModule;
let wllamaStart;
let wllamaAction;
let wllamaExit;
let wllamaDebug;

${WORKER_UTILS}

${MEMFS_PATCH_TO_HEAPFS}

const callWrapper = (name, ret, args) => {
  const fn = wModule.cwrap(name, ret, args);
  return async (action, req) => {
    let result;
    try {
      if (args.length === 2) {
        result = await fn(action, req);
      } else {
        result = fn();
      }
    } catch (ex) {
      console.error(ex);
      throw ex;
    }
    return result;
  };
}

onmessage = async (e) => {
  if (!e.data) return;
  const { verb, args, callbackId } = e.data;

  if (!callbackId) {
    msg({ verb: 'console.error', args: ['callbackId is required', e.data] });
    return;
  }

  if (verb === 'module.init') {
    const argPathConfig      = args[0];
    const argPThreadPoolSize = args[1];
    try {
      const Module = ModuleWrapper();
      wModule = await Module(getWModuleConfig(
        argPathConfig,
        argPThreadPoolSize,
      ));

      // init FS
      patchMEMFS();

      // init cwrap
      wllamaStart  = callWrapper('wllama_start' , 'string', []);
      wllamaAction = callWrapper('wllama_action', 'string', ['string', 'string']);
      wllamaExit   = callWrapper('wllama_exit'  , 'string', []);
      wllamaDebug  = callWrapper('wllama_debug' , 'string', []);
      msg({ callbackId, result: null });

    } catch (err) {
      msg({ callbackId, err });
    }
    return;
  }

  if (verb === 'fs.alloc') {
    const argFilename = args[0];
    const argSize     = args[1];
    try {
      // create blank file
      const emptyBuffer = new ArrayBuffer(0);
      wModule['FS_createDataFile']('/models', argFilename, emptyBuffer, true, true, true);
      // alloc data on heap
      const fileId = heapfsAlloc(argFilename, argSize);
      msg({ callbackId, result: { fileId } });
    } catch (err) {
      msg({ callbackId, err });
    }
    return;
  }

  if (verb === 'fs.write') {
    const argFileId = args[0];
    const argBuffer = args[1];
    const argOffset = args[2];
    try {
      const writtenBytes = heapfsWrite(argFileId, argBuffer, argOffset);
      msg({ callbackId, result: { writtenBytes } });
    } catch (err) {
      msg({ callbackId, err });
    }
    return;
  }

  if (verb === 'wllama.start') {
    try {
      const result = await wllamaStart();
      msg({ callbackId, result });
    } catch (err) {
      msg({ callbackId, err });
    }
    return;
  }

  if (verb === 'wllama.action') {
    const argAction = args[0];
    const argBody = args[1];
    try {
      const result = await wllamaAction(argAction, argBody);
      msg({ callbackId, result });
    } catch (err) {
      msg({ callbackId, err });
    }
    return;
  }

  if (verb === 'wllama.exit') {
    try {
      const result = await wllamaExit();
      msg({ callbackId, result });
    } catch (err) {
      msg({ callbackId, err });
    }
    return;
  }

  if (verb === 'wllama.debug') {
    try {
      const result = await wllamaDebug();
      msg({ callbackId, result });
    } catch (err) {
      msg({ callbackId, err });
    }
    return;
  }
};
`;
class ProxyToWorker {
  constructor(pathConfig, nbThread = 1, suppressNativeLog, logger) {
    this.taskQueue = [];
    this.taskId = 1;
    this.resultQueue = [];
    this.busy = false;
    this.pathConfig = pathConfig;
    this.nbThread = nbThread;
    this.multiThread = nbThread > 1;
    this.logger = logger;
    this.suppressNativeLog = suppressNativeLog;
  }
  async moduleInit(ggufFiles) {
    if (!this.pathConfig["wllama.js"]) {
      throw new Error(
        '"single-thread/wllama.js" or "multi-thread/wllama.js" is missing from pathConfig'
      );
    }
    const Module = await import(this.pathConfig["wllama.js"]);
    let moduleCode = Module.default.toString();
    moduleCode = moduleCode.replace(/import\.meta/g, "importMeta");
    const completeCode = [
      "const importMeta = {}",
      `function ModuleWrapper() {
        const _scriptDir = ${JSON.stringify(window.location.href)};
        return ${moduleCode};
      }`,
      WORKER_CODE$1
    ].join(";\n\n");
    const workerURL = window.URL.createObjectURL(
      new Blob([completeCode], { type: "text/javascript" })
    );
    this.worker = new Worker(workerURL);
    this.worker.onmessage = this.onRecvMsg.bind(this);
    this.worker.onerror = this.logger.error;
    const res = await this.pushTask({
      verb: "module.init",
      args: [this.pathConfig, this.nbThread],
      callbackId: this.taskId++
    });
    const nativeFiles = [];
    for (const file of ggufFiles) {
      const id = await this.fileAlloc(file.name, file.blob.size);
      nativeFiles.push({ id, ...file });
    }
    await Promise.all(
      nativeFiles.map((file) => {
        return this.fileWrite(file.id, file.blob);
      })
    );
    return res;
  }
  async wllamaStart() {
    const result = await this.pushTask({
      verb: "wllama.start",
      args: [],
      callbackId: this.taskId++
    });
    const parsedResult = this.parseResult(result);
    return parsedResult;
  }
  async wllamaAction(name, body) {
    const result = await this.pushTask({
      verb: "wllama.action",
      args: [name, JSON.stringify(body)],
      callbackId: this.taskId++
    });
    const parsedResult = this.parseResult(result);
    return parsedResult;
  }
  async wllamaExit() {
    if (this.worker) {
      const result = await this.pushTask({
        verb: "wllama.exit",
        args: [],
        callbackId: this.taskId++
      });
      this.parseResult(result);
      this.worker.terminate();
    }
  }
  async wllamaDebug() {
    const result = await this.pushTask({
      verb: "wllama.debug",
      args: [],
      callbackId: this.taskId++
    });
    return JSON.parse(result);
  }
  ///////////////////////////////////////
  /**
   * Allocate a new file in heapfs
   * @returns fileId, to be used by fileWrite()
   */
  async fileAlloc(fileName, size) {
    const result = await this.pushTask({
      verb: "fs.alloc",
      args: [fileName, size],
      callbackId: this.taskId++
    });
    return result.fileId;
  }
  /**
   * Write a Blob to heapfs
   */
  async fileWrite(fileId, blob) {
    const reader = blob.stream().getReader();
    let offset = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const size = value.byteLength;
      await this.pushTask(
        {
          verb: "fs.write",
          args: [fileId, value, offset],
          callbackId: this.taskId++
        },
        [value.buffer]
      );
      offset += size;
    }
  }
  /**
   * Parse JSON result returned by cpp code.
   * Throw new Error if "__exception" is present in the response
   */
  parseResult(result) {
    const parsedResult = JSON.parse(result);
    if (parsedResult && parsedResult["__exception"]) {
      throw new Error(parsedResult["__exception"]);
    }
    return parsedResult;
  }
  /**
   * Push a new task to taskQueue
   */
  pushTask(param, buffers) {
    return new Promise((resolve, reject) => {
      this.taskQueue.push({ resolve, reject, param, buffers });
      this.runTaskLoop();
    });
  }
  /**
   * Main loop for processing tasks
   */
  async runTaskLoop() {
    if (this.busy) {
      return;
    }
    this.busy = true;
    while (true) {
      const task = this.taskQueue.shift();
      if (!task) break;
      this.resultQueue.push(task);
      this.worker.postMessage(
        task.param,
        isSafariMobile() ? void 0 : {
          transfer: task.buffers ?? []
        }
      );
    }
    this.busy = false;
  }
  /**
   * Handle messages from worker
   */
  onRecvMsg(e) {
    if (!e.data) return;
    const { verb, args } = e.data;
    if (verb && verb.startsWith("console.")) {
      if (this.suppressNativeLog) {
        return;
      }
      if (verb.endsWith("debug")) this.logger.debug(...args);
      if (verb.endsWith("log")) this.logger.log(...args);
      if (verb.endsWith("warn")) this.logger.warn(...args);
      if (verb.endsWith("error")) this.logger.error(...args);
      return;
    } else if (verb === "signal.abort") {
      this.abort(args[0]);
    }
    const { callbackId, result, err } = e.data;
    if (callbackId) {
      const idx = this.resultQueue.findIndex(
        (t) => t.param.callbackId === callbackId
      );
      if (idx !== -1) {
        const waitingTask = this.resultQueue.splice(idx, 1)[0];
        if (err) waitingTask.reject(err);
        else waitingTask.resolve(result);
      } else {
        this.logger.error(
          `Cannot find waiting task with callbackId = ${callbackId}`
        );
      }
    }
  }
  abort(text) {
    while (this.resultQueue.length > 0) {
      const waitingTask = this.resultQueue.pop();
      if (!waitingTask) break;
      waitingTask.reject(
        new Error(
          `Received abort signal from llama.cpp; Message: ${text || "(empty)"}`
        )
      );
    }
  }
}

const PREFIX_METADATA = "__metadata__";
const POLYFILL_ETAG = "polyfill_for_older_version";
class CacheManager {
  /**
   * Convert a given URL into file name in cache.
   *
   * Format of the file name: `${hashSHA1(fullURL)}_${fileName}`
   */
  async getNameFromURL(url) {
    return await toFileName(url, "");
  }
  /**
   * Write a new file to cache. This will overwrite existing file.
   *
   * @param name The file name returned by `getNameFromURL()` or `list()`
   */
  async write(name, stream, metadata) {
    this.writeMetadata(name, metadata);
    return await opfsWrite(name, stream);
  }
  /**
   * Open a file in cache for reading
   *
   * @param name The file name returned by `getNameFromURL()` or `list()`
   * @returns ReadableStream, or null if file does not exist
   */
  async open(name) {
    return await opfsOpen(name);
  }
  /**
   * Get the size of a file in stored cache
   *
   * NOTE: in case the download is stopped mid-way (i.e. user close browser tab), the file maybe corrupted, size maybe different from `metadata.originalSize`
   *
   * @param name The file name returned by `getNameFromURL()` or `list()`
   * @returns number of bytes, or -1 if file does not exist
   */
  async getSize(name) {
    return await opfsFileSize(name);
  }
  /**
   * Get metadata of a cached file
   */
  async getMetadata(name) {
    const stream = await opfsOpen(name, PREFIX_METADATA);
    const cachedSize = await this.getSize(name);
    if (!stream) {
      return cachedSize > 0 ? (
        // files created by older version of wllama doesn't have metadata, we will try to polyfill it
        {
          etag: POLYFILL_ETAG,
          originalSize: cachedSize,
          originalURL: ""
        }
      ) : (
        // if cached file not found, we don't have metadata at all
        null
      );
    }
    try {
      const meta = await new Response(stream).json();
      return meta;
    } catch (e) {
      return null;
    }
  }
  /**
   * List all files currently in cache
   */
  async list() {
    const cacheDir = await getCacheDir();
    const result = [];
    const metadataMap = {};
    for await (let [name, handler] of cacheDir.entries()) {
      if (handler.kind === "file" && name.startsWith(PREFIX_METADATA)) {
        const stream = (await handler.getFile()).stream();
        const meta = await new Response(stream).json().catch((_) => null);
        metadataMap[name.replace(PREFIX_METADATA, "")] = meta;
      }
    }
    for await (let [name, handler] of cacheDir.entries()) {
      if (handler.kind === "file" && !name.startsWith(PREFIX_METADATA)) {
        result.push({
          name,
          size: await handler.getFile().then((f) => f.size),
          metadata: metadataMap[name] || {
            // try to polyfill for old versions
            originalSize: (await handler.getFile()).size,
            originalURL: "",
            etag: ""
          }
        });
      }
    }
    return result;
  }
  /**
   * Clear all files currently in cache
   */
  async clear() {
    await this.deleteMany(() => true);
  }
  /**
   * Delete a single file in cache
   *
   * @param nameOrURL Can be either an URL or a name returned by `getNameFromURL()` or `list()`
   */
  async delete(nameOrURL) {
    const name2 = await this.getNameFromURL(nameOrURL);
    await this.deleteMany(
      (entry) => entry.name === nameOrURL || entry.name === name2
    );
  }
  /**
   * Delete multiple files in cache.
   *
   * @param predicate A predicate like `array.filter(item => boolean)`
   */
  async deleteMany(predicate) {
    const cacheDir = await getCacheDir();
    const list = await this.list();
    for (const item of list) {
      if (predicate(item)) {
        cacheDir.removeEntry(item.name);
      }
    }
  }
  /**
   * Write the metadata of the file to disk.
   *
   * This function is separated from `write()` for compatibility reason. In older version of wllama, there was no metadata for cached file, so when newer version of wllama loads a file created by older version, it will try to polyfill the metadata.
   */
  async writeMetadata(name, metadata) {
    const blob = new Blob([JSON.stringify(metadata)], { type: "text/plain" });
    await opfsWrite(name, blob.stream(), PREFIX_METADATA);
  }
}
async function opfsWrite(key, stream, prefix = "") {
  try {
    const cacheDir = await getCacheDir();
    const fileName = await toFileName(key, prefix);
    const writable = isSafari() ? await opfsWriteViaWorker(fileName) : await cacheDir.getFileHandle(fileName, { create: true }).then((h) => h.createWritable());
    await writable.truncate(0);
    const reader = stream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      await writable.write(value);
    }
    await writable.close();
  } catch (e) {
    console.error("opfsWrite", e);
  }
}
async function opfsOpen(key, prefix = "") {
  try {
    const cacheDir = await getCacheDir();
    const fileName = await toFileName(key, prefix);
    const fileHandler = await cacheDir.getFileHandle(fileName);
    const file = await fileHandler.getFile();
    return file.stream();
  } catch (e) {
    return null;
  }
}
async function opfsFileSize(key, prefix = "") {
  try {
    const cacheDir = await getCacheDir();
    const fileName = await toFileName(key, prefix);
    const fileHandler = await cacheDir.getFileHandle(fileName);
    const file = await fileHandler.getFile();
    return file.size;
  } catch (e) {
    return -1;
  }
}
async function toFileName(str, prefix) {
  const hashBuffer = await crypto.subtle.digest(
    "SHA-1",
    new TextEncoder().encode(str)
  );
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${prefix}${hashHex}_${str.split("/").pop()}`;
}
async function getCacheDir() {
  const opfsRoot = await navigator.storage.getDirectory();
  const cacheDir = await opfsRoot.getDirectoryHandle("cache", { create: true });
  return cacheDir;
}
const WORKER_CODE = `
const msg = (data) => postMessage(data);
let accessHandle;

onmessage = async (e) => {
  try {
    if (!e.data) return;
    const {
      open,  // name of file to open
      value, // value to be written
      done,  // indicates when to close the file
    } = e.data;

    if (open) {
      const opfsRoot = await navigator.storage.getDirectory();
      const cacheDir = await opfsRoot.getDirectoryHandle('cache', { create: true });
      const fileHandler = await cacheDir.getFileHandle(open, { create: true });
      accessHandle = await fileHandler.createSyncAccessHandle();
      accessHandle.truncate(0); // clear file content
      return msg({ ok: true });

    } else if (value) {
      accessHandle.write(value);
      return msg({ ok: true });

    } else if (done) {
      accessHandle.flush();
      accessHandle.close();
      return msg({ ok: true });
    }

    throw new Error('OPFS Worker: Invalid state');
  } catch (err) {
    return msg({ err });
  }
};
`;
async function opfsWriteViaWorker(fileName) {
  const workerURL = window.URL.createObjectURL(
    new Blob([WORKER_CODE], { type: "text/javascript" })
  );
  const worker = new Worker(workerURL);
  let pResolve;
  let pReject;
  worker.onmessage = (e) => {
    if (e.data.ok) pResolve(null);
    else if (e.data.err) pReject(e.data.err);
  };
  const workerExec = (data) => new Promise((resolve, reject) => {
    pResolve = resolve;
    pReject = reject;
    worker.postMessage(
      data,
      isSafariMobile() ? void 0 : {
        transfer: data.value ? [data.value.buffer] : []
      }
    );
  });
  await workerExec({ open: fileName });
  return {
    truncate: async () => {
    },
    write: (value) => workerExec({ value }),
    close: async () => {
      await workerExec({ done: true });
      worker.terminate();
    }
  };
}

class GGUFRemoteBlob extends Blob {
  constructor(url, start, end, full, customFetch, additionals) {
    super([]);
    this.contentType = "";
    if (start !== 0) {
      throw new Error("start range must be 0");
    }
    this.url = url;
    this.start = start;
    this.end = end;
    this.contentType = "";
    this.full = full;
    this.fetch = customFetch;
    this.cachedStream = additionals.cachedStream;
    this.progressCallback = additionals.progressCallback;
    this.startSignal = additionals.startSignal;
    this.etag = additionals.etag;
    this.noTEE = additionals.noTEE;
    this.cacheManager = additionals.cacheManager;
  }
  static async create(url, opts) {
    const { cacheManager } = opts;
    const customFetch = opts?.fetch ?? fetch;
    const cacheKey = url;
    let remoteFile;
    try {
      const response = await customFetch(url, { method: "HEAD" });
      remoteFile = {
        originalURL: url,
        originalSize: Number(response.headers.get("content-length")),
        etag: (response.headers.get("etag") || "").replace(/[^A-Za-z0-9]/g, "")
        // supportRange: response.headers.get('accept-ranges') === 'bytes';
      };
    } catch (err) {
      if (opts.allowOffline) {
        const cachedMeta = await cacheManager.getMetadata(cacheKey);
        if (cachedMeta) {
          remoteFile = cachedMeta;
        } else {
          throw new Error(
            "Network error, cannot find requested model in cache for using offline"
          );
        }
      } else {
        throw err;
      }
    }
    const cachedFileSize = await cacheManager.getSize(cacheKey);
    const cachedFile = await cacheManager.getMetadata(cacheKey);
    const skipCache = opts?.useCache === false;
    const metadataPolyfilled = cachedFile?.etag === POLYFILL_ETAG;
    if (metadataPolyfilled) {
      await cacheManager.writeMetadata(cacheKey, remoteFile);
    }
    const cachedFileValid = metadataPolyfilled || cachedFile && remoteFile.etag === cachedFile.etag && remoteFile.originalSize === cachedFileSize;
    if (cachedFileValid && !skipCache) {
      opts?.logger?.debug(`Using cached file ${cacheKey}`);
      const cachedFile2 = await cacheManager.open(cacheKey);
      (opts?.startSignal ?? Promise.resolve()).then(() => {
        opts?.progressCallback?.({
          loaded: cachedFileSize,
          total: cachedFileSize
        });
      });
      return new GGUFRemoteBlob(
        url,
        0,
        remoteFile.originalSize,
        true,
        customFetch,
        {
          cachedStream: cachedFile2,
          progressCallback: () => {
          },
          // unused
          etag: remoteFile.etag,
          noTEE: opts.noTEE,
          cacheManager
        }
      );
    } else {
      if (remoteFile.originalSize !== cachedFileSize) {
        opts?.logger?.debug(
          `Cache file is present, but size mismatch (cache = ${cachedFileSize} bytes, remote = ${remoteFile.originalSize} bytes)`
        );
      }
      if (cachedFile && remoteFile.etag !== cachedFile.etag) {
        opts?.logger?.debug(
          `Cache file is present, but ETag mismatch (cache = "${cachedFile.etag}", remote = "${remoteFile.etag}")`
        );
      }
      opts?.logger?.debug(`NOT using cache for ${cacheKey}`);
      return new GGUFRemoteBlob(
        url,
        0,
        remoteFile.originalSize,
        true,
        customFetch,
        {
          progressCallback: opts?.progressCallback ?? (() => {
          }),
          startSignal: opts?.startSignal,
          etag: remoteFile.etag,
          noTEE: opts.noTEE,
          cacheManager
        }
      );
    }
  }
  get size() {
    return this.end - this.start;
  }
  get type() {
    return this.contentType;
  }
  slice() {
    throw new Error("Unsupported operation");
  }
  async arrayBuffer() {
    throw new Error("Unsupported operation");
  }
  async text() {
    throw new Error("Unsupported operation");
  }
  stream() {
    if (this.cachedStream) {
      return this.cachedStream;
    }
    const self = this;
    let loaded = 0;
    const stream = new TransformStream({
      transform(chunk, controller) {
        if (!self.noTEE) {
          controller.enqueue(chunk);
        }
        loaded += chunk.byteLength;
        self.progressCallback({
          loaded,
          total: self.size
        });
      },
      // @ts-ignore unused variable
      flush(controller) {
        self.progressCallback({
          loaded: self.size,
          total: self.size
        });
      }
    });
    (async () => {
      if (this.startSignal) {
        await this.startSignal;
      }
      this.fetchRange().then((response) => {
        const [src0, src1] = response.body.tee();
        src0.pipeThrough(stream);
        this.cacheManager.write(this.url, src1, {
          originalSize: this.end,
          originalURL: this.url,
          etag: this.etag
        });
      }).catch((error) => stream.writable.abort(error.message));
    })();
    return stream.readable;
  }
  fetchRange() {
    const fetch2 = this.fetch;
    if (this.full) {
      return fetch2(this.url);
    }
    return fetch2(this.url, {
      headers: {
        Range: `bytes=${this.start}-${this.end - 1}`
      }
    });
  }
}

class MultiDownloads {
  constructor(logger, urls, maxParallel, cacheManager, opts) {
    this.totalBytes = 0;
    this.tasks = urls.map((url) => {
      const task = {
        url,
        state: 0 /* READY */,
        loaded: 0
      };
      task.signalStart = new Promise((resolve) => task.fireStart = resolve);
      task.signalEnd = new Promise((resolve) => task.fireEnd = resolve);
      return task;
    });
    this.logger = logger;
    this.maxParallel = maxParallel;
    this.progressCallback = opts.progressCallback;
    this.useCache = opts.useCache;
    this.allowOffline = opts.allowOffline;
    this.noTEE = !!opts.noTEE;
    this.cacheManager = cacheManager;
  }
  async run() {
    await Promise.all(
      this.tasks.map(async (task) => {
        task.blob = await GGUFRemoteBlob.create(task.url, {
          logger: this.logger,
          useCache: this.useCache,
          startSignal: task.signalStart,
          allowOffline: this.allowOffline,
          noTEE: this.noTEE,
          cacheManager: this.cacheManager,
          progressCallback: ({ loaded }) => {
            task.loaded = loaded;
            this.updateProgress(task);
          }
        });
      })
    );
    this.totalBytes = this.tasks.reduce((n, task) => n + task.blob.size, 0);
    for (let i = 0; i < this.maxParallel; i++) {
      this.dispatcher();
    }
    return this.tasks.map((t) => t.blob);
  }
  updateProgress(task) {
    const progress = {
      loaded: this.tasks.reduce((n, task2) => n + task2.loaded, 0),
      total: this.totalBytes
    };
    this.progressCallback?.(progress);
    if (task.loaded === task.blob.size) {
      task.state = 2 /* FINISHED */;
      task.fireEnd();
    }
  }
  async dispatcher() {
    while (true) {
      const task = this.tasks.find((t) => t.state === 0 /* READY */);
      if (!task) return;
      task.state = 1 /* WORKING */;
      task.fireStart();
      await task.signalEnd;
    }
  }
}

class WllamaError extends Error {
  constructor(message, type = "unknown_error") {
    super(message);
    this.type = type;
  }
}
class Wllama {
  constructor(pathConfig, wllamaConfig = {}) {
    this.proxy = null;
    this.useMultiThread = false;
    this.useEmbeddings = false;
    // available when loaded
    this.loadedContextInfo = null;
    this.bosToken = -1;
    this.eosToken = -1;
    this.eotToken = -1;
    this.addBosToken = false;
    this.addEosToken = false;
    this.samplingConfig = {};
    this.hasEncoder = false;
    this.decoderStartToken = -1;
    this.nCachedTokens = 0;
    checkEnvironmentCompatible();
    if (!pathConfig) throw new WllamaError("AssetsPathConfig is required");
    this.pathConfig = pathConfig;
    this.config = wllamaConfig;
    this.cacheManager = wllamaConfig.cacheManager ?? new CacheManager();
  }
  logger() {
    return this.config.logger ?? console;
  }
  checkModelLoaded() {
    if (!this.isModelLoaded()) {
      throw new WllamaError(
        "loadModel() is not yet called",
        "model_not_loaded"
      );
    }
  }
  /**
   * Check if the model is loaded via `loadModel()`
   */
  isModelLoaded() {
    return !!this.proxy && !!this.metadata;
  }
  /**
   * Get token ID associated to BOS (begin of sentence) token.
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns -1 if the model is not loaded.
   */
  getBOS() {
    return this.bosToken;
  }
  /**
   * Get token ID associated to EOS (end of sentence) token.
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns -1 if the model is not loaded.
   */
  getEOS() {
    return this.eosToken;
  }
  /**
   * Get token ID associated to EOT (end of turn) token.
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns -1 if the model is not loaded.
   */
  getEOT() {
    return this.eotToken;
  }
  /**
   * Get token ID associated to token used by decoder, to start generating output sequence(only usable for encoder-decoder architecture). In other words, encoder uses normal BOS and decoder uses this token.
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns -1 if the model is not loaded.
   */
  getDecoderStartToken() {
    return this.decoderStartToken;
  }
  /**
   * Get model hyper-parameters and metadata
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns ModelMetadata
   */
  getModelMetadata() {
    this.checkModelLoaded();
    return this.metadata;
  }
  /**
   * Check if we're currently using multi-thread build.
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns true if multi-thread is used.
   */
  isMultithread() {
    this.checkModelLoaded();
    return this.useMultiThread;
  }
  /**
   * Check if the current model uses encoder-decoder architecture
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns true if multi-thread is used.
   */
  isEncoderDecoderArchitecture() {
    this.checkModelLoaded();
    return this.hasEncoder;
  }
  /**
   * Must we add BOS token to the tokenized sequence?
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns true if BOS token must be added to the sequence
   */
  mustAddBosToken() {
    this.checkModelLoaded();
    return this.addBosToken;
  }
  /**
   * Must we add EOS token to the tokenized sequence?
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns true if EOS token must be added to the sequence
   */
  mustAddEosToken() {
    this.checkModelLoaded();
    return this.addEosToken;
  }
  /**
   * Get the jinja chat template comes with the model. It only available if the original model (before converting to gguf) has the template in `tokenizer_config.json`
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns the jinja template. null if there is no template in gguf
   */
  getChatTemplate() {
    this.checkModelLoaded();
    return this.chatTemplate ?? null;
  }
  /**
   * Parses a model URL and returns an array of URLs based on the following patterns:
   * - If the input URL is an array, it returns the array itself.
   * - If the input URL is a string in the `gguf-split` format, it returns an array containing the URL of each shard in ascending order.
   * - Otherwise, it returns an array containing the input URL as a single element array.
   * @param modelUrl URL or list of URLs
   */
  parseModelUrl(modelUrl) {
    if (Array.isArray(modelUrl)) {
      return modelUrl;
    }
    const urlPartsRegex = /(?<baseURL>.*)-(?<current>\d{5})-of-(?<total>\d{5})\.gguf$/;
    const matches = modelUrl.match(urlPartsRegex);
    if (!matches || !matches.groups || Object.keys(matches.groups).length !== 3) {
      return [modelUrl];
    }
    const { baseURL, total } = matches.groups;
    const paddedShardIds = Array.from(
      { length: Number(total) },
      (_, index) => (index + 1).toString().padStart(5, "0")
    );
    return paddedShardIds.map(
      (current) => `${baseURL}-${current}-of-${total}.gguf`
    );
  }
  /**
   * Download a model to cache, without loading it
   * @param modelUrl URL or list of URLs (in the correct order)
   * @param config
   */
  async downloadModel(modelUrl, config = {}) {
    if (modelUrl.length === 0) {
      throw new WllamaError(
        "modelUrl must be an URL or a list of URLs (in the correct order)",
        "download_error"
      );
    }
    if (config.useCache === false) {
      throw new WllamaError("useCache must not be false", "download_error");
    }
    const multiDownloads = new MultiDownloads(
      this.logger(),
      this.parseModelUrl(modelUrl),
      config.parallelDownloads ?? 3,
      this.cacheManager,
      {
        progressCallback: config.progressCallback,
        useCache: true,
        allowOffline: !!config.allowOffline,
        noTEE: true
      }
    );
    const blobs = await multiDownloads.run();
    await Promise.all(
      blobs.map(async (blob) => {
        const reader = blob.stream().getReader();
        while (true) {
          const { done } = await reader.read();
          if (done) return;
        }
      })
    );
  }
  /**
   * Load model from a given URL (or a list of URLs, in case the model is splitted into smaller files)
   * - If the model already been downloaded (via `downloadModel()`), then we will use the cached model
   * - Else, we download the model from internet
   * @param modelUrl URL or list of URLs (in the correct order)
   * @param config
   */
  async loadModelFromUrl(modelUrl, config = {}) {
    if (modelUrl.length === 0) {
      throw new WllamaError(
        "modelUrl must be an URL or a list of URLs (in the correct order)",
        "load_error"
      );
    }
    const skipCache = config.useCache === false;
    const multiDownloads = new MultiDownloads(
      this.logger(),
      this.parseModelUrl(modelUrl),
      config.parallelDownloads ?? 3,
      this.cacheManager,
      {
        progressCallback: config.progressCallback,
        useCache: !skipCache,
        allowOffline: !!config.allowOffline
      }
    );
    const blobs = await multiDownloads.run();
    return await this.loadModel(blobs, config);
  }
  /**
   * Load model from a given list of Blob.
   *
   * You can pass multiple buffers into the function (in case the model contains multiple shards).
   *
   * @param ggufBlobs List of Blob that holds data of gguf file.
   * @param config LoadModelConfig
   */
  async loadModel(ggufBlobs, config = {}) {
    const blobs = [...ggufBlobs];
    if (blobs.some((b) => b.size === 0)) {
      throw new WllamaError(
        "Input model (or splits) must be non-empty Blob or File",
        "load_error"
      );
    }
    maybeSortFileByName(blobs);
    const hasMultipleBuffers = blobs.length > 1;
    if (this.proxy) {
      throw new WllamaError("Module is already initialized", "load_error");
    }
    const supportMultiThread = await isSupportMultiThread();
    if (!supportMultiThread) {
      this.logger().warn(
        "Multi-threads are not supported in this environment, falling back to single-thread"
      );
    }
    const hasPathMultiThread = !!this.pathConfig["multi-thread/wllama.js"] && !!this.pathConfig["multi-thread/wllama.wasm"] && !!this.pathConfig["multi-thread/wllama.worker.mjs"];
    if (!hasPathMultiThread) {
      this.logger().warn(
        'Missing paths to "wllama.js", "wllama.wasm" or "wllama.worker.mjs", falling back to single-thread'
      );
    }
    const hwConccurency = Math.floor((navigator.hardwareConcurrency || 1) / 2);
    const nbThreads = config.n_threads ?? hwConccurency;
    this.useMultiThread = supportMultiThread && hasPathMultiThread && nbThreads > 1;
    const mPathConfig = this.useMultiThread ? {
      "wllama.js": absoluteUrl(this.pathConfig["multi-thread/wllama.js"]),
      "wllama.wasm": absoluteUrl(
        this.pathConfig["multi-thread/wllama.wasm"]
      ),
      "wllama.worker.mjs": absoluteUrl(
        this.pathConfig["multi-thread/wllama.worker.mjs"]
      )
    } : {
      "wllama.js": absoluteUrl(this.pathConfig["single-thread/wllama.js"]),
      "wllama.wasm": absoluteUrl(
        this.pathConfig["single-thread/wllama.wasm"]
      )
    };
    this.proxy = new ProxyToWorker(
      mPathConfig,
      this.useMultiThread ? nbThreads : 1,
      this.config.suppressNativeLog ?? false,
      this.logger()
    );
    await this.proxy.moduleInit(
      blobs.map((blob, i) => ({
        name: hasMultipleBuffers ? `model-${padDigits(i + 1, 5)}-of-${padDigits(blobs.length, 5)}.gguf` : "model.gguf",
        blob
      }))
    );
    const startResult = await this.proxy.wllamaStart();
    if (!startResult.success) {
      throw new WllamaError(
        `Error while calling start function, result = ${startResult}`
      );
    }
    const loadResult = await this.proxy.wllamaAction(
      "load",
      {
        ...config,
        use_mmap: true,
        use_mlock: true,
        seed: config.seed || Math.floor(Math.random() * 1e5),
        n_ctx: config.n_ctx || 1024,
        n_threads: this.useMultiThread ? nbThreads : 1,
        model_path: hasMultipleBuffers ? `/models/model-00001-of-${padDigits(blobs.length, 5)}.gguf` : "/models/model.gguf"
      }
    );
    this.bosToken = loadResult.token_bos;
    this.eosToken = loadResult.token_eos;
    this.eotToken = loadResult.token_eot;
    this.useEmbeddings = !!config.embeddings;
    this.metadata = {
      hparams: {
        nVocab: loadResult.n_vocab,
        nCtxTrain: loadResult.n_ctx_train,
        nEmbd: loadResult.n_embd,
        nLayer: loadResult.n_layer
      },
      meta: loadResult.metadata
    };
    this.hasEncoder = !!loadResult.has_encoder;
    this.decoderStartToken = loadResult.token_decoder_start;
    this.addBosToken = loadResult.add_bos_token;
    this.addEosToken = loadResult.add_eos_token;
    this.chatTemplate = loadResult.metadata["tokenizer.chat_template"];
    this.loadedContextInfo = loadResult;
    this.logger().debug({ loadResult });
  }
  getLoadedContextInfo() {
    this.checkModelLoaded();
    if (!this.loadedContextInfo) {
      throw new WllamaError("Loaded context info is not available");
    }
    return { ...this.loadedContextInfo };
  }
  //////////////////////////////////////////////
  // High level API
  /**
   * Calculate embedding vector for a given text.
   * By default, BOS and EOS tokens will be added automatically. You can use the "skipBOS" and "skipEOS" option to disable it.
   * @param text Input text
   * @returns An embedding vector
   */
  async createEmbedding(text, options = {}) {
    this.checkModelLoaded();
    const opt = {
      skipBOS: false,
      skipEOS: false,
      ...options
    };
    await this.samplingInit(this.samplingConfig);
    await this.kvClear();
    const tokens = await this.tokenize(text);
    if (this.bosToken && !opt.skipBOS) {
      tokens.unshift(this.bosToken);
    }
    if (this.eosToken && !opt.skipEOS) {
      tokens.push(this.eosToken);
    }
    const result = await this.embeddings(tokens);
    return result;
  }
  /**
   * Make completion for a given text.
   * @param prompt Input text
   * @param options
   * @returns Output completion text (only the completion part)
   */
  async createCompletion(prompt, options) {
    this.checkModelLoaded();
    this.samplingConfig = options.sampling ?? {};
    await this.samplingInit(this.samplingConfig);
    const stopTokens = [
      this.eosToken,
      this.eotToken,
      ...options.stopTokens ?? []
    ];
    let tokens = await this.tokenize(prompt, true);
    if (this.addBosToken && tokens[0] !== this.bosToken) {
      tokens.unshift(this.bosToken);
    }
    if (options.useCache) {
      tokens = await this.computeNonCachedTokens(tokens);
    } else {
      await this.kvClear();
    }
    await this.samplingAccept(tokens);
    if (this.isEncoderDecoderArchitecture()) {
      await this.encode(tokens);
      await this.decode([this.getDecoderStartToken()], {});
    } else {
      await this.decode(tokens, {});
    }
    let outBuf = new Uint8Array();
    let abort = false;
    const abortSignal = () => {
      abort = true;
    };
    for (let i = 0; i < (options.nPredict ?? Infinity); i++) {
      const sampled = await this.samplingSample();
      if (stopTokens.includes(sampled.token)) {
        break;
      }
      outBuf = joinBuffers([outBuf, sampled.piece]);
      if (options.onNewToken) {
        options.onNewToken(sampled.token, sampled.piece, bufToText(outBuf), {
          abortSignal
        });
      }
      if (abort) {
        break;
      }
      await this.samplingAccept([sampled.token]);
      await this.decode([sampled.token], {});
    }
    return bufToText(outBuf);
  }
  //////////////////////////////////////////////
  // Low level API
  /**
   * Create or reset the ctx_sampling
   * @param config
   * @param pastTokens In case re-initializing the ctx_sampling, you can re-import past tokens into the new context
   */
  async samplingInit(config, pastTokens = []) {
    this.checkModelLoaded();
    this.samplingConfig = config;
    const result = await this.proxy.wllamaAction("sampling_init", {
      ...config,
      tokens: pastTokens
    });
    if (!result.success) {
      throw new WllamaError("Failed to initialize sampling");
    }
  }
  /**
   * Get a list of pieces in vocab.
   * NOTE: This function is slow, should only be used once.
   * @returns A list of Uint8Array. The nth element in the list associated to nth token in vocab
   */
  async getVocab() {
    this.checkModelLoaded();
    const result = await this.proxy.wllamaAction("get_vocab", {});
    return result.vocab.map((arr) => new Uint8Array(arr));
  }
  /**
   * Lookup to see if a token exist in vocab or not. Useful for searching special tokens like "<|im_start|>"
   * NOTE: It will match the whole token, so do not use it as a replacement for tokenize()
   * @param piece
   * @returns Token ID associated to the given piece. Returns -1 if cannot find the token.
   */
  async lookupToken(piece) {
    this.checkModelLoaded();
    const result = await this.proxy.wllamaAction("lookup_token", { piece });
    if (!result.success) {
      return -1;
    } else {
      return result.token;
    }
  }
  /**
   * Convert a given text to list of tokens
   * @param text
   * @param special Should split special tokens?
   * @returns List of token ID
   */
  async tokenize(text, special = true) {
    this.checkModelLoaded();
    const result = await this.proxy.wllamaAction(
      "tokenize",
      special ? { text, special: true } : { text }
    );
    return result.tokens;
  }
  /**
   * Convert a list of tokens to text
   * @param tokens
   * @returns Uint8Array, which maybe an unfinished unicode
   */
  async detokenize(tokens) {
    this.checkModelLoaded();
    const result = await this.proxy.wllamaAction("detokenize", { tokens });
    return new Uint8Array(result.buffer);
  }
  /**
   * Run llama_decode()
   * @param tokens A list of tokens to be decoded
   * @param options
   * @returns n_past (number of tokens so far in the sequence)
   */
  async decode(tokens, options) {
    this.checkModelLoaded();
    if (this.useEmbeddings) {
      throw new WllamaError(
        "embeddings is enabled. Use wllama.setOptions({ embeddings: false }) to disable it."
      );
    }
    if (tokens.length === 0) {
      return {
        nPast: this.nCachedTokens
      };
    }
    if (this.nCachedTokens + tokens.length > this.loadedContextInfo.n_ctx) {
      throw new WllamaError(
        "Running out of context cache. Please increase n_ctx when loading the model",
        "kv_cache_full"
      );
    }
    const batches = this.breakTokensIntoBatches(
      tokens,
      this.loadedContextInfo.n_batch
    );
    let result;
    for (let i = 0; i < batches.length; i++) {
      const isNotLast = batches.length > 1 && i < batches.length - 1;
      result = await this.proxy.wllamaAction("decode", {
        tokens: batches[i],
        skip_logits: options.skipLogits || isNotLast
      });
      if (result.error) {
        throw new WllamaError(result.error);
      } else if (!result.success) {
        throw new WllamaError("Cannot encode, unknown error");
      }
    }
    this.nCachedTokens = result.n_past;
    return { nPast: result.n_past };
  }
  /**
   * Run llama_encode()
   * @param tokens A list of tokens to be encoded
   * @param options Unused for now
   * @returns n_past (number of tokens so far in the sequence)
   */
  async encode(tokens, options) {
    this.checkModelLoaded();
    if (!this.hasEncoder) {
      throw new WllamaError(
        "This model does not use encoder-decoder architecture.",
        "inference_error"
      );
    }
    if (this.useEmbeddings) {
      throw new WllamaError(
        "embeddings is enabled. Use wllama.setOptions({ embeddings: false }) to disable it.",
        "inference_error"
      );
    }
    if (tokens.length === 0) {
      return {
        nPast: this.nCachedTokens
      };
    }
    if (this.nCachedTokens + tokens.length > this.loadedContextInfo.n_ctx) {
      throw new WllamaError(
        "Running out of context cache. Please increase n_ctx when loading the model",
        "kv_cache_full"
      );
    }
    const batches = this.breakTokensIntoBatches(
      tokens,
      this.loadedContextInfo.n_batch
    );
    let result;
    for (let i = 0; i < batches.length; i++) {
      result = await this.proxy.wllamaAction("encode", { tokens: batches[i] });
      if (result.error) {
        throw new WllamaError(result.error);
      } else if (!result.success) {
        throw new WllamaError("Cannot encode, unknown error");
      }
    }
    this.nCachedTokens = result.n_past;
    return { nPast: result.n_past };
  }
  breakTokensIntoBatches(tokens, maxBatchSize) {
    const batches = [];
    for (let i = 0; i < tokens.length; i += maxBatchSize) {
      batches.push(tokens.slice(i, i + maxBatchSize));
    }
    return batches;
  }
  /**
   * Sample a new token (remember to samplingInit() at least once before calling this function)
   * @returns the token ID and its detokenized value (which maybe an unfinished unicode)
   */
  async samplingSample() {
    this.checkModelLoaded();
    const result = await this.proxy.wllamaAction("sampling_sample", {});
    return {
      piece: new Uint8Array(result.piece),
      token: result.token
    };
  }
  /**
   * Accept and save a new token to ctx_sampling
   * @param tokens
   */
  async samplingAccept(tokens) {
    this.checkModelLoaded();
    const result = await this.proxy.wllamaAction("sampling_accept", { tokens });
    if (!result.success) {
      throw new WllamaError("samplingAccept unknown error");
    }
  }
  /**
   * Get softmax-ed probability of logits, can be used for custom sampling
   * @param topK Get top K tokens having highest logits value. If topK == -1, we return all n_vocab logits, but this is not recommended because it's slow.
   */
  async getLogits(topK = 40) {
    this.checkModelLoaded();
    const result = await this.proxy.wllamaAction("get_logits", { top_k: topK });
    const logits = result.logits;
    return logits.map(([token, p]) => ({ token, p }));
  }
  /**
   * Calculate embeddings for a given list of tokens. Output vector is always normalized
   * @param tokens
   * @returns A list of number represents an embedding vector of N dimensions
   */
  async embeddings(tokens) {
    this.checkModelLoaded();
    if (!this.useEmbeddings) {
      throw new WllamaError(
        "embeddings is disabled. Use wllama.setOptions({ embeddings: true }) to enable it.",
        "inference_error"
      );
    }
    if (this.nCachedTokens > 0) {
      this.logger().warn(
        "Embeddings: KV cache is not empty, this may produce incorrect results"
      );
    }
    if (this.nCachedTokens + tokens.length > this.loadedContextInfo.n_ctx) {
      throw new WllamaError(
        "Running out of context cache. Please increase n_ctx when loading the model",
        "kv_cache_full"
      );
    }
    if (tokens.length > this.loadedContextInfo.n_batch) {
      throw new WllamaError(
        "Embedding tokens does not fit into batch. Please increase n_batch when loading the model",
        "inference_error"
      );
    }
    if (tokens.length > this.loadedContextInfo.n_ubatch) {
      throw new WllamaError(
        "Embedding tokens does not fit into physical batch. Please increase n_ubatch when loading the model",
        "inference_error"
      );
    }
    const result = await this.proxy.wllamaAction("embeddings", { tokens });
    if (result.error) {
      throw new WllamaError(result.error);
    } else if (!result.success) {
      throw new WllamaError("embeddings unknown error");
    } else {
      return result.embeddings;
    }
  }
  /**
   * Remove and shift some tokens from KV cache.
   * Keep n_keep, remove n_discard then shift the rest
   * @param nKeep
   * @param nDiscard
   */
  async kvRemove(nKeep, nDiscard) {
    this.checkModelLoaded();
    const result = await this.proxy.wllamaAction("kv_remove", {
      n_keep: nKeep,
      n_discard: nDiscard
    });
    if (!result.success) {
      throw new WllamaError("kvRemove unknown error");
    }
    this.nCachedTokens -= nDiscard;
  }
  /**
   * Clear all tokens in KV cache
   */
  async kvClear() {
    this.checkModelLoaded();
    const result = await this.proxy.wllamaAction("kv_clear", {});
    if (!result.success) {
      throw new WllamaError("kvClear unknown error");
    }
    this.nCachedTokens = 0;
  }
  /**
   * Save session to file (virtual file system)
   * TODO: add ability to download the file
   * @param filePath
   * @returns List of tokens saved to the file
   */
  async sessionSave(filePath) {
    this.checkModelLoaded();
    const result = await this.proxy.wllamaAction("session_save", {
      session_path: filePath
    });
    return result;
  }
  /**
   * Load session from file (virtual file system)
   * TODO: add ability to download the file
   * @param filePath
   *
   */
  async sessionLoad(filePath) {
    this.checkModelLoaded();
    const result = await this.proxy.wllamaAction("session_load", {
      session_path: filePath
    });
    if (result.error) {
      throw new WllamaError(result.error);
    } else if (!result.success) {
      throw new WllamaError("sessionLoad unknown error");
    }
    const cachedTokens = await this.getCachedTokens();
    this.nCachedTokens = cachedTokens.length;
  }
  /**
   * Set options for underlaying llama_context
   */
  async setOptions(opt) {
    this.checkModelLoaded();
    await this.proxy.wllamaAction("set_options", opt);
    this.useEmbeddings = opt.embeddings;
  }
  /**
   * Unload the model and free all memory.
   *
   * Note: This function will NOT crash if model is not yet loaded
   */
  async exit() {
    await this.proxy?.wllamaExit();
  }
  /**
   * get debug info
   */
  async _getDebugInfo() {
    this.checkModelLoaded();
    return await this.proxy.wllamaDebug();
  }
  ///// Prompt cache utils /////
  async getCachedTokens() {
    this.checkModelLoaded();
    const result = await this.proxy.wllamaAction("current_status", {});
    return result.tokens;
  }
  /**
   * Compare the input sequence and cachedToken, then return the part that is not in cache.
   * This function also remove mismatch part in cache (via kvRemove)
   */
  async computeNonCachedTokens(seq) {
    const cachedTokens = await this.getCachedTokens();
    let nKeep = 0;
    for (; nKeep < Math.min(cachedTokens.length, seq.length); nKeep++) {
      if (cachedTokens[nKeep] !== seq[nKeep]) {
        break;
      }
    }
    const nDiscard = cachedTokens.length - nKeep;
    this.logger().debug(`Cache nKeep=${nKeep} nDiscard=${nDiscard}`);
    if (nDiscard > 0) {
      await this.kvRemove(nKeep, nDiscard);
    }
    return seq.slice(nKeep, seq.length);
  }
  // TODO: add current_status
}

async function detectWasmFeatures() {
  try {
    const simd = await WebAssembly.validate(
      new Uint8Array([
        0,
        97,
        115,
        109,
        1,
        0,
        0,
        0,
        1,
        5,
        1,
        96,
        0,
        1,
        123,
        3,
        2,
        1,
        0,
        10,
        10,
        1,
        8,
        0,
        65,
        0,
        253,
        15,
        253,
        98,
        11
      ])
    );
    const threads = typeof SharedArrayBuffer !== "undefined" && typeof Atomics !== "undefined" && crossOriginIsolated;
    const bulkMemory = await WebAssembly.validate(
      new Uint8Array([
        0,
        97,
        115,
        109,
        1,
        0,
        0,
        0,
        1,
        4,
        1,
        96,
        0,
        0,
        3,
        2,
        1,
        0,
        5,
        3,
        1,
        0,
        1,
        10,
        14,
        1,
        12,
        0,
        65,
        0,
        65,
        0,
        65,
        0,
        252,
        10,
        0,
        11
      ])
    );
    console.log("🔍 WASM Features detected:", {
      simd: simd ? "✅" : "❌",
      threads: threads ? "✅" : "❌",
      bulkMemory: bulkMemory ? "✅" : "❌"
    });
    if (!threads && typeof SharedArrayBuffer !== "undefined") {
      console.warn(
        "⚠️ SharedArrayBuffer available but crossOriginIsolated=false. Add COOP/COEP headers to enable threads:\nCross-Origin-Opener-Policy: same-origin\nCross-Origin-Embedder-Policy: require-corp"
      );
    }
    return { simd, threads, bulkMemory };
  } catch (error) {
    console.error("❌ Failed to detect WASM features:", error);
    return { simd: false, threads: false, bulkMemory: false };
  }
}
function getRecommendedWllamaBuild(features) {
  if (features.threads && features.simd) {
    return {
      path: "multi-thread/wllama.wasm",
      description: "Multi-threaded + SIMD (fastest)",
      speedMultiplier: 3
    };
  }
  if (features.simd) {
    return {
      path: "single-thread/wllama.wasm",
      description: "Single-threaded + SIMD",
      speedMultiplier: 2
    };
  }
  return {
    path: "single-thread/wllama.wasm",
    description: "Basic (no SIMD)",
    speedMultiplier: 1
  };
}
function getOptimalThreadCount(features) {
  if (!features.threads) return 1;
  const cores = navigator.hardwareConcurrency || 4;
  return Math.max(2, Math.min(8, Math.floor(cores * 0.75)));
}

class WllamaEngine {
  wllama = null;
  modelUrl = "";
  isInitialized = false;
  constructor() {
    console.log("🤖 Wllama Engine created (Pure WASM CPU backend)");
  }
  /**
   * Initialize the Wllama engine with a GGUF model
   * Uses small quantized models optimized for CPU
   */
  async initialize(modelUrl, onProgress) {
    if (this.isInitialized && this.modelUrl === modelUrl) {
      console.log("✅ Wllama already initialized");
      return;
    }
    try {
      console.log("🚀 Initializing Wllama (WebAssembly CPU)...");
      onProgress?.(0, "Inicializando motor WASM...");
      const wasmFeatures = await detectWasmFeatures();
      const recommendedBuild = getRecommendedWllamaBuild(wasmFeatures);
      const optimalThreads = getOptimalThreadCount(wasmFeatures);
      console.log(`🎯 Using ${recommendedBuild.description} (${recommendedBuild.speedMultiplier}x speed)`);
      console.log(`🧵 Using ${optimalThreads} threads`);
      const defaultModelUrl = modelUrl || "https://huggingface.co/Qwen/Qwen2-0.5B-Instruct-GGUF/resolve/main/qwen2-0_5b-instruct-q4_k_m.gguf";
      this.modelUrl = defaultModelUrl;
      const isMultiThread = recommendedBuild.path.includes("multi-thread");
      const basePath = isMultiThread ? "/wllama/multi-thread/wllama" : "/wllama/single-thread/wllama";
      const config = {
        "single-thread/wllama.wasm": basePath + ".wasm",
        "single-thread/wllama.js": basePath + ".js"
      };
      if (isMultiThread) {
        config["multi-thread/wllama.wasm"] = basePath + ".wasm";
        config["multi-thread/wllama.js"] = basePath + ".js";
        config["multi-thread/wllama.worker.mjs"] = "/wllama/multi-thread/wllama.worker.mjs";
      }
      this.wllama = new Wllama(config);
      onProgress?.(10, "Descargando modelo (se guardará en caché)...");
      await this.wllama.loadModelFromUrl(this.modelUrl, {
        n_ctx: 2048,
        embeddings: true,
        // Enable embeddings support
        n_threads: optimalThreads,
        // Use optimal thread count
        progressCallback: ({ loaded, total }) => {
          if (total > 0) {
            const percent = Math.round(loaded / total * 70);
            const loadedMB = Math.round(loaded / 1024 / 1024);
            const totalMB = Math.round(total / 1024 / 1024);
            onProgress?.(10 + percent, `Descargando: ${loadedMB}MB / ${totalMB}MB`);
          }
        }
      });
      onProgress?.(95, "Modelo procesado...");
      this.isInitialized = true;
      console.log("✅ Wllama initialized successfully (WASM/CPU)");
      onProgress?.(100, "Modelo cargado (CPU)");
    } catch (error) {
      console.error("❌ Failed to initialize Wllama:", error);
      this.isInitialized = false;
      throw new Error(
        `Failed to initialize Wllama: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }
  /**
   * Generate embeddings for a text (for semantic search)
   * Wllama supports embeddings natively
   */
  async generateEmbedding(text) {
    if (!this.isInitialized || !this.wllama) {
      throw new Error("Wllama engine not initialized");
    }
    try {
      const maxLength = 256;
      const truncatedText = text.length > maxLength ? text.substring(0, maxLength) : text;
      if (text.length > maxLength) {
        console.log(`⚠️ Truncating text from ${text.length} to ${maxLength} chars for embedding`);
      }
      console.log(`🔢 Generating embedding for ${truncatedText.length} chars...`);
      const startTime = Date.now();
      const result = await this.wllama.createEmbedding(truncatedText);
      const elapsed = Date.now() - startTime;
      console.log(`✅ Embedding generated in ${elapsed}ms`);
      return result;
    } catch (error) {
      console.error("❌ Wllama embedding failed:", error);
      throw error;
    }
  }
  /**
   * Generate text response using Wllama
   * Supports streaming for better UX
   */
  async generateText(prompt, options = {}) {
    if (!this.isInitialized || !this.wllama) {
      throw new Error("Wllama engine not initialized");
    }
    const {
      temperature = 0.7,
      maxTokens = 512,
      onStream
    } = options;
    try {
      console.log("💬 Generating text with Wllama (CPU)...");
      await this.wllama.setOptions({ embeddings: false });
      let fullResponse = "";
      if (onStream) {
        await this.wllama.createCompletion(prompt, {
          nPredict: maxTokens,
          temp: temperature,
          onNewToken: (_token, _piece, currentText) => {
            const newChunk = currentText.slice(fullResponse.length);
            if (newChunk) {
              fullResponse = currentText;
              onStream(newChunk);
            }
          }
        });
      } else {
        const result = await this.wllama.createCompletion(prompt, {
          nPredict: maxTokens,
          temp: temperature
        });
        fullResponse = result;
      }
      await this.wllama.setOptions({ embeddings: true });
      console.log("✅ Generated", fullResponse.length, "characters (CPU)");
      return fullResponse;
    } catch (error) {
      console.error("❌ Text generation failed:", error);
      throw new Error(
        `Failed to generate text: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }
  /**
   * Generate embeddings in batch (parallel processing with concurrency limit)
   */
  async generateEmbeddingsBatch(texts, maxConcurrent = 4, onProgress) {
    if (!this.isInitialized || !this.wllama) {
      throw new Error("Wllama engine not initialized");
    }
    console.log(`🔢 Generating ${texts.length} embeddings in batch (concurrency=${maxConcurrent})...`);
    const results = new Array(texts.length);
    const queue = texts.map((text, idx) => ({ text, idx }));
    let completed = 0;
    const workers = Array(maxConcurrent).fill(null).map(async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (!item) break;
        const { text, idx } = item;
        const truncated = text.substring(0, 256);
        try {
          const embedding = await this.wllama.createEmbedding(truncated);
          results[idx] = embedding;
        } catch (error) {
          console.warn(`⚠️ Failed to generate embedding for text ${idx}:`, error);
          results[idx] = new Float32Array(384);
        }
        completed++;
        if (completed % 5 === 0 || completed === texts.length) {
          const progress = Math.round(completed / texts.length * 100);
          onProgress?.(progress, `Embeddings: ${completed}/${texts.length}`);
        }
      }
    });
    await Promise.all(workers);
    console.log(`✅ Generated ${texts.length} embeddings in batch`);
    return results;
  }
  /**
   * Get the current backend being used
   */
  getBackend() {
    return "wasm";
  }
  /**
   * Check if the engine is initialized
   */
  isReady() {
    return this.isInitialized && this.wllama !== null;
  }
  /**
   * Get the current model URL
   */
  getModelUrl() {
    return this.modelUrl;
  }
  /**
   * Reset/unload the model (free memory)
   */
  async reset() {
    if (this.wllama) {
      console.log("🔄 Resetting Wllama engine...");
      try {
        await this.wllama.exit();
      } catch (error) {
        console.warn("Error during Wllama exit:", error);
      }
      this.wllama = null;
      this.isInitialized = false;
      this.modelUrl = "";
      console.log("✅ Wllama engine reset");
    }
  }
}

let engine = null;
self.onmessage = async (event) => {
  const { id, type, payload } = event.data;
  try {
    switch (type) {
      case "init": {
        await handleInit(id, payload.modelUrl);
        break;
      }
      case "generate-embedding": {
        await handleGenerateEmbedding(id, payload.text);
        break;
      }
      case "generate-embeddings-batch": {
        await handleGenerateEmbeddingsBatch(
          id,
          payload.texts,
          payload.maxConcurrent
        );
        break;
      }
      case "reset": {
        await handleReset(id);
        break;
      }
      default:
        sendError(id, `Unknown message type: ${type}`);
    }
  } catch (error) {
    sendError(id, error instanceof Error ? error.message : "Unknown error");
  }
};
async function handleInit(id, modelUrl) {
  try {
    if (!engine) {
      engine = new WllamaEngine();
    }
    await engine.initialize(modelUrl, (progress, status) => {
      sendProgress(id, progress, status);
    });
    sendSuccess(id, { initialized: true });
  } catch (error) {
    sendError(id, `Failed to initialize engine: ${error}`);
  }
}
async function handleGenerateEmbedding(id, text) {
  if (!engine || !engine.isReady()) {
    sendError(id, "Engine not initialized");
    return;
  }
  try {
    const embedding = await engine.generateEmbedding(text);
    const embeddingArray = Array.from(embedding);
    sendSuccess(id, { embedding: embeddingArray });
  } catch (error) {
    sendError(id, `Failed to generate embedding: ${error}`);
  }
}
async function handleGenerateEmbeddingsBatch(id, texts, maxConcurrent = 4) {
  if (!engine || !engine.isReady()) {
    sendError(id, "Engine not initialized");
    return;
  }
  try {
    const embeddings = await engine.generateEmbeddingsBatch(
      texts,
      maxConcurrent,
      (progress, status) => {
        sendProgress(id, progress, status);
      }
    );
    const embeddingsArray = embeddings.map((emb) => Array.from(emb));
    sendSuccess(id, { embeddings: embeddingsArray });
  } catch (error) {
    sendError(id, `Failed to generate embeddings batch: ${error}`);
  }
}
async function handleReset(id) {
  if (engine) {
    await engine.reset();
    engine = null;
  }
  sendSuccess(id, { reset: true });
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
