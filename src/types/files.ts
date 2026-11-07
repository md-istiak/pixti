/** Structural type satisfied by browser `File` and Node `File`/`Blob`-likes (used by tests). */
export interface InputFile {
  name: string;
  size: number;
  type?: string;
  arrayBuffer(): Promise<ArrayBuffer>;
}
