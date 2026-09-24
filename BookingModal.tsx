import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';

interface BookingModalProps {
    mentorId: string;
    onClose: () => void;
    onSuccess: () => void;
}

interface PaymentData {
    tn: string;
    amount: number;
    upiVpa: string;
    upiName: string;
}

export const BookingModal: React.FC<BookingModalProps> = ({ mentorId, onClose, onSuccess }) => {
    const [paymentData, setPaymentData] = useState<PaymentData | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [status, setStatus] = useState<'pending' | 'utr_submitted' | 'completed' | 'failed'>('pending');
    const [timer, setTimer] = useState<number>(60);
    const [showUtrForm, setShowUtrForm] = useState<boolean>(false);
    const [utrInput, setUtrInput] = useState<string>('');
    const [submittingUtr, setSubmittingUtr] = useState<boolean>(false);
    const [utrError, setUtrError] = useState<string | null>(null);

    // 1. Fetch QR Order details on mount
    useEffect(() => {
        const initializePayment = async () => {
            try {
                const response = await fetch('/api/payment/create-qr', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ mentorId })
                });
                if (!response.ok) throw new Error('Failed to initialize payment');
                const data = await response.json();
                setPaymentData(data);
            } catch (err: any) {
                setError(err.message || 'Something went wrong');
            } finally {
                setLoading(false);
            }
        };

        initializePayment();
    }, [mentorId]);

    // 2. Poll transaction status
    useEffect(() => {
        if (!paymentData || status === 'completed' || status === 'failed') return;

        const interval = setInterval(async () => {
            try {
                const response = await fetch(`/api/payment/status/${paymentData.tn}`);
                if (!response.ok) return;
                const data = await response.json();

                if (data.status === 'completed') {
                    setStatus('completed');
                    clearInterval(interval);
                    setTimeout(() => {
                        onSuccess();
                    }, 2000);
                } else if (data.status === 'failed') {
                    setStatus('failed');
                    clearInterval(interval);
                } else if (data.status === 'utr_submitted') {
                    setStatus('utr_submitted');
                }
            } catch (err) {
                console.error('Error polling transaction status:', err);
            }
        }, 3000);

        return () => clearInterval(interval);
    }, [paymentData, status, onSuccess]);

    // 3. Countdown timer for automatic confirmation timeout
    useEffect(() => {
        if (status !== 'pending' || timer <= 0) {
            if (timer <= 0) setShowUtrForm(true);
            return;
        }

        const countdown = setInterval(() => {
            setTimer((prev) => prev - 1);
        }, 1000);

        return () => clearInterval(countdown);
    }, [status, timer]);

    const handleUtrSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!paymentData) return;
        if (!/^\d{12}$/.test(utrInput.trim())) {
            setUtrError('Please enter a valid 12-digit UPI UTR / Reference number');
            return;
        }

        setSubmittingUtr(true);
        setUtrError(null);

        try {
            const response = await fetch('/api/payment/submit-utr', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tn: paymentData.tn, utr: utrInput.trim() })
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Failed to submit UTR');

            setStatus('utr_submitted');
        } catch (err: any) {
            setUtrError(err.message || 'Failed to submit UTR');
        } finally {
            setSubmittingUtr(false);
        }
    };

    const [isMobile, setIsMobile] = useState<boolean>(false);

    // Detect mobile device
    useEffect(() => {
        const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
        if (/android|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent.toLowerCase())) {
            setIsMobile(true);
        }
    }, []);

    if (loading) return <div className="modal-loader">Initializing secure payment...</div>;
    if (error) return <div className="modal-error">Error: {error}</div>;
    if (!paymentData) return null;

    const upiUrl = `upi://pay?pa=${encodeURIComponent(paymentData.upiVpa)}&pn=${encodeURIComponent(paymentData.upiName)}&am=${paymentData.amount}&tn=${encodeURIComponent(paymentData.tn)}&tr=${encodeURIComponent(paymentData.tn)}`;
    const phonepeUrl = `phonepe://pay?pa=${encodeURIComponent(paymentData.upiVpa)}&pn=${encodeURIComponent(paymentData.upiName)}&am=${paymentData.amount}&tn=${encodeURIComponent(paymentData.tn)}&tr=${encodeURIComponent(paymentData.tn)}`;
    const paytmUrl = `paytmmp://pay?pa=${encodeURIComponent(paymentData.upiVpa)}&pn=${encodeURIComponent(paymentData.upiName)}&am=${paymentData.amount}&tn=${encodeURIComponent(paymentData.tn)}&tr=${encodeURIComponent(paymentData.tn)}`;
    const gpayUrl = `intent://pay?pa=${encodeURIComponent(paymentData.upiVpa)}&pn=${encodeURIComponent(paymentData.upiName)}&am=${paymentData.amount}&tn=${encodeURIComponent(paymentData.tn)}&tr=${encodeURIComponent(paymentData.tn)}#Intent;scheme=upi;package=com.google.android.apps.nbu.paisa.user;end`;

    return (
        <div className="modal-overlay">
            <div className="modal-content" style={{ maxWidth: '440px', width: '90%', padding: '24px', borderRadius: '16px', background: '#ffffff', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)', fontFamily: 'sans-serif' }}>
                <button className="close-button" onClick={onClose} style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#6b7280' }}>&times;</button>

                {status === 'pending' && !showUtrForm && (
                    <div className="payment-flow" style={{ textAlign: 'center' }}>
                        <h3 style={{ margin: '0 0 6px 0', fontSize: '20px', color: '#1f2937' }}>{isMobile ? 'Pay via UPI App' : 'Scan QR to Pay'}</h3>
                        <p className="amount" style={{ fontSize: '28px', fontWeight: 'bold', color: '#16a34a', margin: '4px 0 16px 0' }}>₹{paymentData.amount}</p>

                        {/* Mobile Direct Pay Buttons */}
                        {isMobile ? (
                            <div className="mobile-app-buttons" style={{ display: 'flex', flexDirection: 'column', gap: '10px', margin: '16px 0' }}>
                                <a 
                                    href={gpayUrl} 
                                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px', background: '#4285F4', color: '#fff', borderRadius: '10px', textDecoration: 'none', fontWeight: 'bold', fontSize: '15px' }}
                                >
                                    <span>🔵 Pay via Google Pay</span>
                                </a>

                                <a 
                                    href={phonepeUrl} 
                                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px', background: '#5f259f', color: '#fff', borderRadius: '10px', textDecoration: 'none', fontWeight: 'bold', fontSize: '15px' }}
                                >
                                    <span>🟣 Pay via PhonePe</span>
                                </a>

                                <a 
                                    href={paytmUrl} 
                                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px', background: '#00baf2', color: '#fff', borderRadius: '10px', textDecoration: 'none', fontWeight: 'bold', fontSize: '15px' }}
                                >
                                    <span>🔷 Pay via Paytm / BharatPe</span>
                                </a>

                                <a 
                                    href={upiUrl} 
                                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px', background: '#374151', color: '#fff', borderRadius: '10px', textDecoration: 'none', fontSize: '13px' }}
                                >
                                    <span>⚡ Open Any Other UPI App</span>
                                </a>
                            </div>
                        ) : null}

                        {/* QR Code Container (Prominent on Desktop, optional view on mobile) */}
                        <div className="qr-container" style={{ display: 'inline-block', padding: '16px', background: '#f9fafb', borderRadius: '12px', border: '1px solid #e5e7eb', margin: '8px 0' }}>
                            <QRCodeSVG value={upiUrl} size={isMobile ? 150 : 200} />
                        </div>

                        <p className="instruction" style={{ fontSize: '13px', color: '#6b7280', margin: '10px 0 16px 0' }}>
                            {isMobile ? 'Tap a button above to pay directly, or scan this QR using another device.' : 'Scan using GPay, PhonePe, Paytm, BharatPe, or BHIM.'}
                            <br />
                            <span style={{ fontSize: '11px', color: '#ef4444' }}>⚠️ Do not edit the payment note / reference in your app.</span>
                        </p>

                        <div className="status-indicator" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '13px', color: '#2563eb', background: '#eff6ff', padding: '10px', borderRadius: '8px' }}>
                            <span className="spinner">⏳</span> Waiting for payment confirmation... ({timer}s)
                        </div>

                        <button 
                            className="link-btn" 
                            style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', marginTop: '14px', fontSize: '13px', textDecoration: 'underline' }}
                            onClick={() => setShowUtrForm(true)}
                        >
                            Already paid? Enter 12-digit UTR manually
                        </button>
                    </div>
                )}

                {status === 'pending' && showUtrForm && (
                    <div className="utr-form-flow">
                        <h3>Submit UPI UTR Number</h3>
                        <p className="utr-desc">
                            If you have already paid, enter the 12-digit UTR / UPI Ref No. from your GPay / PhonePe / BharatPe receipt.
                        </p>

                        <form onSubmit={handleUtrSubmit} style={{ marginTop: '15px' }}>
                            <input 
                                type="text"
                                maxLength={12}
                                placeholder="e.g. 426189345012"
                                value={utrInput}
                                onChange={(e) => setUtrInput(e.target.value)}
                                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '16px', letterSpacing: '2px', textAlign: 'center' }}
                            />

                            {utrError && <p className="error-text" style={{ color: 'red', fontSize: '12px', marginTop: '5px' }}>{utrError}</p>}

                            <div style={{ marginTop: '15px', display: 'flex', gap: '10px' }}>
                                <button 
                                    type="submit" 
                                    disabled={submittingUtr}
                                    style={{ flex: 1, padding: '10px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                                >
                                    {submittingUtr ? 'Submitting...' : 'Verify UTR'}
                                </button>
                                <button 
                                    type="button" 
                                    onClick={() => setShowUtrForm(false)}
                                    style={{ padding: '10px', background: '#6b7280', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                                >
                                    Back to QR
                                </button>
                            </div>
                        </form>
                    </div>
                )}

                {status === 'utr_submitted' && (
                    <div className="payment-pending-verify" style={{ textAlign: 'center', padding: '20px 10px' }}>
                        <div className="pending-icon" style={{ fontSize: '40px', marginBottom: '10px' }}>⏳</div>
                        <h3>UTR Submitted!</h3>
                        <p style={{ fontSize: '14px', color: '#4b5563', margin: '10px 0' }}>
                            Your UTR <strong>{utrInput || 'submitted'}</strong> has been received. 
                            Our system / admin will verify your transaction within 1-2 hours.
                        </p>
                        <p style={{ fontSize: '12px', color: '#6b7280' }}>
                            Transaction Ref: <code>{paymentData.tn}</code>
                        </p>
                        <button 
                            onClick={onClose}
                            style={{ marginTop: '15px', padding: '10px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                        >
                            Done
                        </button>
                    </div>
                )}

                {status === 'completed' && (
                    <div className="payment-success">
                        <div className="success-icon">✓</div>
                        <h3>Payment Successful!</h3>
                        <p>Your booking is confirmed.</p>
                    </div>
                )}

                {status === 'failed' && (
                    <div className="payment-failed">
                        <div className="failed-icon">✗</div>
                        <h3>Payment Failed</h3>
                        <p>The transaction expired or failed. Please try again.</p>
                    </div>
                )}
            </div>
        </div>
    );
};
