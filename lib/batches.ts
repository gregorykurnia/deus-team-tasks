import { writeBatch, type Firestore, type WriteBatch } from "firebase/firestore";

// Firestore takes at most 500 writes per batch; 450 leaves room.
export const BATCH_LIMIT = 450;

export type BatchOp = (batch: WriteBatch) => void;

// Commits the writes in batches of 450. Each batch is all or nothing; a list
// longer than one batch is committed batch by batch, in order.
export async function commitInChunks(db: Firestore, ops: BatchOp[], size = BATCH_LIMIT): Promise<void> {
  for (let i = 0; i < ops.length; i += size) {
    const batch = writeBatch(db);
    ops.slice(i, i + size).forEach((op) => op(batch));
    await batch.commit();
  }
}
