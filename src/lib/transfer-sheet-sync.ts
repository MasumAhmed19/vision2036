import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import Transfer from '@/models/Transfer';
import { syncGroupedTransfersToGoogleSheets, syncTransferToGoogleSheets } from '@/lib/google-sheets';

// Google Sheets append is outside MongoDB's transaction. A short lease keeps
// simultaneous review/retry requests from appending the same deposit twice;
// the sheet-side row check handles an append whose response was lost.
export async function syncApprovedTransferToSheet(transferId: string, verifiedByName: string): Promise<Date> {
  const transfer = await Transfer.findById(transferId);
  if (!transfer || transfer.status !== 'VERIFIED') throw new Error('Only verified transfers can be synced');

  const group = transfer.paymentGroupId
    ? await Transfer.find({ paymentGroupId: transfer.paymentGroupId }).sort({ selectMonth: 1 })
      .populate('initiator', 'name email').populate('verifiedById', 'name email')
    : await Transfer.find({ _id: transfer._id })
      .populate('initiator', 'name email').populate('verifiedById', 'name email');
  if (group.length !== (transfer.paymentGroupId ? transfer.paymentGroupSize : 1) ||
      group.some((item) => item.status !== 'VERIFIED')) {
    throw new Error('Incomplete or unverified payment submission');
  }

  const lead = group[0];
  const token = randomUUID();
  const now = new Date();
  const claimed = await Transfer.findOneAndUpdate({
    _id: lead._id,
    status: 'VERIFIED',
    $or: [
      { sheetSyncLease: { $exists: false } },
      { 'sheetSyncLease.expiresAt': { $lte: now } },
    ],
  }, {
    $set: { sheetSyncLease: { token, expiresAt: new Date(now.getTime() + 10 * 60_000) } },
  }, { returnDocument: 'after' });
  if (!claimed) throw new Error('This payment is already syncing to Google Sheets. Retry shortly.');

  try {
    if (transfer.paymentGroupId) {
      await syncGroupedTransfersToGoogleSheets(group as unknown as Parameters<typeof syncGroupedTransfersToGoogleSheets>[0], verifiedByName);
    } else {
      await syncTransferToGoogleSheets(lead as unknown as Parameters<typeof syncTransferToGoogleSheets>[0], verifiedByName);
    }
    const syncedAt = new Date();
    await mongoose.connection.transaction(async (session) => {
      await Transfer.updateMany(
        transfer.paymentGroupId ? { paymentGroupId: transfer.paymentGroupId } : { _id: transfer._id },
        { $set: { syncedToSheet: true, syncedAt } },
        { session }
      );
    });
    return syncedAt;
  } finally {
    await Transfer.updateOne({ _id: lead._id, 'sheetSyncLease.token': token }, { $unset: { sheetSyncLease: 1 } });
  }
}
