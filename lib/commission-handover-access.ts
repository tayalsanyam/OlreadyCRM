/** Active in-flight pushes may be worked by the current lead owner. */
export function canCommissionRmManagePush(params: {
  pushStatus: string;
}): boolean {
  return (
    params.pushStatus === "active" || params.pushStatus === "awaitingClose"
  );
}
