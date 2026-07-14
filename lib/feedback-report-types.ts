export type FeedbackReportScope = "mine" | "team";

export type FeedbackOutcomesSummary = {
  connectedFeedbacks: number;
  positive: number;
  negative: number;
  mixed: number;
  notAnswered: number;
  notInterested: number;
  avgOlreadyRating: number | null;
  avgMuaRating: number | null;
  brideReferrals: number;
  referralsConverted: number;
  outsideMuas: number;
  careTicketsRaised: number;
  engageAgainYes: number;
  engageAgainMaybe: number;
  engageAgainNo: number;
};

export type FeedbackOutcomeRow = {
  id: string;
  leadId: string;
  displayId: string;
  brideName: string;
  connectionStatus: string;
  serviceSentiment: string | null;
  olreadyRating: number | null;
  muaRating: number | null;
  muaType: string;
  nonOlreadyMuaName: string | null;
  engageAgain: string | null;
  submittedByName: string | null;
  createdAt: string;
};
