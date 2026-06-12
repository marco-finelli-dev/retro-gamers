type ApiErrorLike = {
  code?: string;
  message?: string;
  hint?: string;
  details?: string;
};

export function logApiError(context: string, error: unknown) {
  const apiError = error as ApiErrorLike | null;

  console.error('Community API error:', {
    context,
    code: apiError?.code,
    message: apiError?.message || (error instanceof Error ? error.message : String(error)),
    hint: apiError?.hint,
    details: apiError?.details,
  });
}
