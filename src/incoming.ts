export async function publishBeforeAcceptingIngress(input: {
  publishLocalCopy: () => Promise<void>;
  acceptIngress: () => Promise<void>;
}) {
  await input.publishLocalCopy();
  await input.acceptIngress();
}

