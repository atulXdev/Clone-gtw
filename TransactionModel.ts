import mongoose, { Schema, Types, model } from 'mongoose';

export interface ITransaction {
    user: Types.ObjectId;
    mentorId: string;
    amount: number;
    tn: string;
    utr?: string;
    status: 'pending' | 'utr_submitted' | 'completed' | 'failed';
    expiresAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

const transactionSchema = new Schema<ITransaction>({
    user: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    tn: {
        type: String,
        required: true,
        unique: true
    },
    utr: {
        type: String,
        sparse: true
    },
    mentorId: { type: String, required: true },
    status: {
        type: String,
        enum: ['pending', 'utr_submitted', 'completed', 'failed'],
        default: 'pending'
    },
    expiresAt: {
        type: Date,
        default: () => new Date(Date.now() + 10 * 60 * 1000)
    }
}, {
    timestamps: true
});

transactionSchema.index({ expiresAt: 1 },
    {
        expireAfterSeconds: 0,
        partialFilterExpression: { status: 'pending' }
    }

);


export const Transaction = model<ITransaction>('Transaction', transactionSchema);

