export const readFileSync = () => { throw new Error('fs.readFileSync is not supported in the browser'); };
export const existsSync = () => false;
export const lstatSync = () => { throw new Error('fs.lstatSync is not supported in the browser'); };
export default {
  readFileSync,
  existsSync,
  lstatSync
};
