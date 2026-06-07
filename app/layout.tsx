import "./globals.css";

export const metadata = { title: "Sales Analytics" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-900" suppressHydrationWarning>{children}</body>
    </html>
  );
}
