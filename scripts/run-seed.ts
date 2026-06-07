import "dotenv/config";
import { resetSeeding, ensureSeeded } from "../src/lib/seed";
import { prisma } from "../src/lib/db";

async function main() {
  // Clear existing data so the running server's Prisma connection stays valid
  await prisma.correction.deleteMany();
  await prisma.transaction.deleteMany();
  resetSeeding();
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
