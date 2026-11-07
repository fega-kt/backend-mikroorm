interface MailRecipient {
  workEmail?: string | null;
  loginName?: string | null;
}

const asEmail = (value?: string | null) => {
  const email = value?.trim();
  return email?.includes("@") ? email : undefined;
};

/** Địa chỉ nhận mail công việc: email công việc; chỉ khi bật setting mới dùng email đăng nhập cho người chưa có */
export function recipientAddress(user: MailRecipient, fallbackToLoginName: boolean) {
  return asEmail(user.workEmail) ?? (fallbackToLoginName ? asEmail(user.loginName) : undefined);
}
