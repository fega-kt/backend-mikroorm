import { FileContextType, type FileAccessPolicy } from "@core-service/services/file-view/file-access-policy";
import { Injectable, Scope } from "@nestjs/common";
import { ApprovalRequestService } from "./approval-request.service";

/** Tệp của tờ trình: quyền xem tệp = quyền xem tờ trình (người tạo, người tham gia duyệt, quyền xem mọi tờ trình) */
@Injectable({ scope: Scope.REQUEST })
export class ApprovalRequestFilePolicy implements FileAccessPolicy {
  readonly contextType = FileContextType.ApprovalRequest;

  constructor(private readonly requestService: ApprovalRequestService) {}

  resolveFile(requestId: string, fileId: string) {
    return this.requestService.resolveViewableFile(requestId, fileId);
  }
}
