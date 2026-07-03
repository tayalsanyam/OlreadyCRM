export function deriveSalesProfileStatus(input: {
  pipelineStatus?: string | null;
  onboarding?: {
    checklist1Complete?: boolean;
    checklist2Complete?: boolean;
  } | null;
  training?: { complete?: boolean } | null;
  activation?: {
    activatedAt?: string | null;
    activated_at?: string | null;
    contractGenerated?: boolean;
    contract_generated?: boolean;
    contractUrl?: string | null;
    contract_url?: string | null;
    sentBackAt?: string | null;
    sent_back_at?: string | null;
  } | null;
}): string {
  const activation = input.activation;
  const activatedAt = activation?.activatedAt ?? activation?.activated_at;
  const sentBackAt = activation?.sentBackAt ?? activation?.sent_back_at;
  const contractGenerated = activation?.contractGenerated ?? activation?.contract_generated;
  const contractUrl = activation?.contractUrl ?? activation?.contract_url;

  if (activatedAt) return "Active";
  if (sentBackAt && !input.training?.complete) return "Activation issues — fix training";
  if (input.training?.complete) {
    if (contractGenerated && !contractUrl) {
      return "Awaiting Signature";
    }
    return "Ready for activation";
  }
  if (input.onboarding?.checklist1Complete && input.onboarding?.checklist2Complete) {
    return "Training";
  }
  if (input.pipelineStatus === "closed") return "Onboarding";
  return "In pipeline";
}
