import "dotenv/config";
import { ensureSeeded } from "../src/lib/seed";
import { prisma } from "../src/lib/db";

async function main() {
  await ensureSeeded();

  const count = await prisma.transaction.count();
  console.log(`Seeded ${count} transactions.`);

  const sample = await prisma.transaction.findMany({ take: 5, orderBy: { date: "desc" } });
  console.table(sample.map((t) => ({
    customerName: t.customerName, amount: t.amount, currency: t.currency,
    region: t.region, salesRep: t.salesRep, date: t.date,
  })));
}

main().catch(console.error).finally(() => prisma.$disconnect());
