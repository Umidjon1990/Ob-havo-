export class PublishError extends Error {
  constructor(
    message: string,
    public retryable = false,
    public ambiguous = false,
  ) {
    super(message);
  }
}
