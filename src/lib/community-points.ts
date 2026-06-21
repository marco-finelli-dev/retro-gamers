export type CommunityPointsInput = {
  approvedComments?: number | null;
  receivedLikes?: number | null;
  reviewRatings?: number | null;
};

export const calculateCommunityPoints = ({
  approvedComments = 0,
  receivedLikes = 0,
  reviewRatings = 0,
}: CommunityPointsInput) =>
  1 +
  Math.floor(Number(reviewRatings || 0) / 3) +
  Math.floor(Number(approvedComments || 0) / 5) +
  Math.floor(Number(receivedLikes || 0) / 5);
