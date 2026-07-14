import { StaffMuasTabs } from "@/components/muas/StaffMuasTabs";

export default function CareMuasLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <StaffMuasTabs variant="care" />
      {children}
    </div>
  );
}
