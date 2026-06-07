import Link from "next/link";
import { TransactionForm } from "@/src/components/TransactionForm";

export default function NewTransactionPage() {
  return (
    <main className="mx-auto max-w-lg space-y-4 p-6">
      <Link href="/" className="text-sm text-blue-600 hover:underline">← Back to dashboard</Link>
      <h1 className="text-xl font-semibold text-slate-900">New Transaction</h1>
      <TransactionForm />
    </main>
  );
}
