import MaterialNav from '@/components/material/MaterialNav';

export default function MaterialLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="page">
      <MaterialNav />
      {children}
    </div>
  );
}
