import {Request, Response} from 'express';
import {Transaction} from './TransactionModel';


export const createQrOrder = async (req: Request, res: Response) => {
    try{
        const userId = req.user ? req.user._id.toString() : '60d0fe4f5311236168a109ca';
        const tn = `user_id_${userId}_${Date.now()}`;
        const sessionAmount = req.body.amount || 200;
        const mentorId = req.body.mentorId || 'default_mentor';
        const newTransaction = await Transaction.create({
            user: userId,
            mentorId: mentorId,
            amount: sessionAmount,
            tn: tn
    });
        return res.status(200).json({
            tn: newTransaction.tn,
            amount: newTransaction.amount,
            upiVpa: process.env.MERCHANT_UPI_ID || 'merchant@upi',  
            upiName: process.env.MERCHANT_UPI_NAME || 'Merchant Name'
          });
}catch (error) {
    console.error('Error creating QR order:', error);
        return res.status(500).json({ message: 'Failed to initialize payment' });
}   

    }



export const webhook = async (req: Request, res: Response) => {
    try {
        const { tn, utr, note } = req.body;
        let resolvedTn = tn;
        let resolvedUtr = utr;

        if (!resolvedTn && note) {
            const tnMatch = note.match(/user_id_[a-zA-Z0-9]+_\d+/);
            resolvedTn = tnMatch ? tnMatch[0] : null;
        }

        if (!resolvedUtr && note) {
            const utrMatch = note.match(/\b\d{12}\b/);
            resolvedUtr = utrMatch ? utrMatch[0] : null;
        }

        // Search criteria: match by TN or match by UTR for pending / utr_submitted transactions
        const filterCriteria: any[] = [];
        if (resolvedTn) filterCriteria.push({ tn: resolvedTn });
        if (resolvedUtr) filterCriteria.push({ utr: resolvedUtr });

        if (filterCriteria.length === 0) {
            return res.status(400).json({ message: 'Could not extract transaction note or UTR from payload' });
        }

        const transaction = await Transaction.findOneAndUpdate(
            {
                $or: filterCriteria,
                status: { $in: ['pending', 'utr_submitted'] }
            },
            {
                status: 'completed',
                ...(resolvedUtr ? { utr: resolvedUtr } : {})
            },
            { returnDocument: 'after' }
        );

        if (!transaction) {
            return res.status(200).json({ message: 'Transaction not found or already processed' });
        }

        console.log('Transaction updated via Webhook:', transaction);
        return res.status(200).json({ message: 'Transaction updated successfully', transaction });
    } catch (error) {
        console.error('Error updating transaction:', error);
        return res.status(500).json({ message: 'Failed to update transaction' });
    }
};

export const submitUtr = async (req: Request, res: Response) => {
    try {
        const { tn, utr } = req.body;

        if (!tn || !utr) {
            return res.status(400).json({ message: 'Transaction note (tn) and UTR are required' });
        }

        const cleanUtr = utr.toString().trim();
        if (!/^\d{12}$/.test(cleanUtr)) {
            return res.status(400).json({ message: 'Invalid UTR format. Must be a 12-digit UPI Reference Number.' });
        }

        const transaction = await Transaction.findOne({ tn });
        if (!transaction) {
            return res.status(404).json({ message: 'Transaction not found' });
        }

        if (transaction.status === 'completed') {
            return res.status(200).json({ message: 'Transaction already completed!', status: 'completed' });
        }

        transaction.utr = cleanUtr;
        transaction.status = 'utr_submitted';
        await transaction.save();

        console.log(`UTR ${cleanUtr} submitted for TN: ${tn}`);
        return res.status(200).json({
            message: 'UTR submitted successfully. Verification in progress.',
            status: transaction.status,
            utr: transaction.utr
        });
    } catch (error) {
        console.error('Error submitting UTR:', error);
        return res.status(500).json({ message: 'Failed to submit UTR' });
    }
};

export const getPendingTransactions = async (req: Request, res: Response) => {
    try {
        const pendingList = await Transaction.find({
            status: { $in: ['utr_submitted', 'pending'] }
        }).sort({ updatedAt: -1 });

        return res.status(200).json({ count: pendingList.length, transactions: pendingList });
    } catch (error) {
        console.error('Error fetching pending transactions:', error);
        return res.status(500).json({ message: 'Failed to fetch pending transactions' });
    }
};

export const approveTransaction = async (req: Request, res: Response) => {
    try {
        const { tn, action } = req.body; // action: 'approve' | 'reject'
        if (!tn || !['approve', 'reject'].includes(action)) {
            return res.status(400).json({ message: 'Valid tn and action (approve/reject) are required' });
        }

        const newStatus = action === 'approve' ? 'completed' : 'failed';
        const transaction = await Transaction.findOneAndUpdate(
            { tn },
            { status: newStatus },
            { returnDocument: 'after' }
        );

        if (!transaction) {
            return res.status(404).json({ message: 'Transaction not found' });
        }

        return res.status(200).json({ message: `Transaction ${action}d successfully`, transaction });
    } catch (error) {
        console.error('Error approving transaction:', error);
        return res.status(500).json({ message: 'Failed to update transaction status' });
    }
};