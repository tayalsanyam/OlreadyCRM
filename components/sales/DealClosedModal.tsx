"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export type DealClosedPayload = { amount: number; paymentDate: string; paymentMode: "UPI" | "Cash" | "Bank Transfer" | "Card" | "Other"; notes?: string };

export function DealClosedModal({ open, onClose, onConfirm }: { open: boolean; onClose: () => void; onConfirm: (v: DealClosedPayload) => void }) {
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentMode, setPaymentMode] = useState<DealClosedPayload["paymentMode"]>("UPI");
  const [notes, setNotes] = useState("");

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Deal Closed — Payment Details"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => onConfirm({ amount: Number(amount), paymentDate, paymentMode, notes: notes.trim() || undefined })}
            disabled={!Number(amount) || !paymentDate}
          >
            Save deal
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Input label="Amount (INR)" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <Input label="Date" type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
        <div>
          <label className="mb-1 block text-sm font-medium text-text">Payment Mode</label>
          <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={paymentMode} onChange={(e) => setPaymentMode(e.target.value as DealClosedPayload["paymentMode"])}>
            {['UPI','Cash','Bank Transfer','Card','Other'].map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-text">Notes (optional)</label>
          <textarea className="min-h-20 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}
