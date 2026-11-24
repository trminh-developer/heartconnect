import React, { useState, useEffect } from 'react';
import { Status } from '../../models';
import { Avatar, Button } from '../common';
import { useAlert } from '../../contexts/AlertContext';
import { useNavigate } from 'react-router-dom';
import UserBadge from '../user/UserBadge';
import { useAuth } from '../../hooks/useAuth';
import { feedService } from '../../services';

interface StatusCardProps {
  status: Status;
  onLike: (id: string) => void;
  onComment: (id: string, content: string) => Promise<any>;
  getComments: (id: string) => Promise<any[]>;
  onUpdate?: (id: string, content: string) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
}

const REPORT_REASONS: string[] = [
  'Nội dung spam hoặc lừa đảo',
  'Nội dung phản cảm, khiêu dâm',
  'Quấy rối, xúc phạm hoặc đe dọa',
  'Bạo lực hoặc kích động thù địch',
  'Thông tin sai lệch hoặc mạo danh',
  'Lý do khác',
];

export const StatusCard: React.FC<StatusCardProps> = ({
  status,
  onLike,
  onComment,
  getComments,
  onUpdate,
  onDelete,
}) => {
  const { user } = useAuth();
  const { showAlert } = useAlert();
  const navigate = useNavigate();

  const [showComments, setShowComments] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [comments, setComments] = useState<any[]>([]);
  const [isCommentsLoaded, setIsCommentsLoaded] = useState(false);

  // Edit State
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(status.content);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Delete State
  const [isDeleting, setIsDeleting] = useState(false);

  // Saved / Bookmark State
  const getSavedIds = (): string[] => {
    try {
      const raw = localStorage.getItem('hc_saved_posts');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  };
  const [isSaved, setIsSaved] = useState<boolean>(() => getSavedIds().includes(status.id));

  useEffect(() => {
    const handleSavedUpdated = () => {
      setIsSaved(getSavedIds().includes(status.id));
    };
    window.addEventListener('hc_saved_posts_updated', handleSavedUpdated);
    return () => window.removeEventListener('hc_saved_posts_updated', handleSavedUpdated);
  }, [status.id]);

  // Report Modal State
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState<string>(REPORT_REASONS[0] || 'Lý do khác');
  const [reportDetails, setReportDetails] = useState('');
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);

  const author = status.user || (status as any).User || {};
  const authorName = `${author.firstName || author.first_name || author.username || 'Người dùng'} ${author.lastName || author.last_name || ''}`.trim();
  const authorAvatar = author.avatar || '';

  const isOwner = user && (user.id === status.userId || user.id === author.id);
  const isAuthorOrAdmin = isOwner || user?.role === 'ADMIN';

  // Toggle comments
  const handleToggleComments = async () => {
    if (!showComments && !isCommentsLoaded) {
      try {
        const data = await getComments(status.id);
        setComments(data);
        setIsCommentsLoaded(true);
      } catch (error: any) {
        showAlert(error.response?.data?.error || 'Không thể tải bình luận.', 'error');
        return;
      }
    }
    setShowComments(!showComments);
  };

  // Post comment
  const handlePostComment = async () => {
    if (!commentText.trim()) return;
    try {
      const newComment = await onComment(status.id, commentText);
      if (newComment) {
        setComments(previous => [...previous, newComment]);
        setCommentText('');
      }
    } catch (error: any) {
      showAlert(error.response?.data?.error || 'Không thể gửi bình luận.', 'error');
    }
  };

  // 1. Edit Post
  const handleSaveEdit = async () => {
    if (!editContent.trim()) {
      showAlert('Nội dung bài viết không được để trống.', 'warning');
      return;
    }
    setIsSavingEdit(true);
    try {
      if (onUpdate) {
        await onUpdate(status.id, editContent);
      } else {
        await feedService.updateStatus(status.id, editContent);
        status.content = editContent;
        showAlert('Cập nhật bài viết thành công!', 'success');
      }
      setIsEditing(false);
    } catch (err: any) {
      showAlert(err.response?.data?.error || 'Không thể cập nhật bài viết.', 'error');
    } finally {
      setIsSavingEdit(false);
    }
  };

  // 2. Delete Post
  const handleDeletePost = async () => {
    setShowDropdown(false);
    const confirmed = window.confirm('Bạn có chắc chắn muốn xóa bài viết này không? Hành động này không thể hoàn tác.');
    if (!confirmed) return;

    setIsDeleting(true);
    try {
      if (onDelete) {
        await onDelete(status.id);
      } else {
        await feedService.deleteStatus(status.id);
        showAlert('Đã xóa bài viết thành công!', 'success');
      }
    } catch (err: any) {
      showAlert(err.response?.data?.error || 'Không thể xóa bài viết.', 'error');
      setIsDeleting(false);
    }
  };

  // 3. Save / Bookmark Post
  const handleToggleSave = () => {
    setShowDropdown(false);
    const current = getSavedIds();
    let next: string[];
    if (current.includes(status.id)) {
      next = current.filter(id => id !== status.id);
      setIsSaved(false);
      showAlert('Đã bỏ lưu bài viết.', 'info');
    } else {
      next = [...current, status.id];
      setIsSaved(true);
      showAlert('Đã lưu bài viết vào mục Đã lưu!', 'success');
    }
    localStorage.setItem('hc_saved_posts', JSON.stringify(next));
    window.dispatchEvent(new Event('hc_saved_posts_updated'));
  };

  // 4. Report Post
  const handleOpenReportModal = () => {
    setShowDropdown(false);
    setReportReason(REPORT_REASONS[0] || 'Lý do khác');
    setReportDetails('');
    setShowReportModal(true);
  };

  const handleSendReport = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingReport(true);
    try {
      await feedService.reportStatus(status.id, reportReason || 'Lý do khác', reportDetails);
      showAlert('Cảm ơn bạn! Báo cáo bài viết đã được gửi tới Quản trị viên để kiểm duyệt.', 'success');
      setShowReportModal(false);
    } catch (err: any) {
      showAlert(err.response?.data?.error || 'Không thể gửi báo cáo lúc này.', 'error');
    } finally {
      setIsSubmittingReport(false);
    }
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: `Bài viết của ${status.user?.firstName}`,
        text: status.content,
        url: window.location.href,
      }).catch(console.error);
    } else {
      handleCopyLink();
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    showAlert('Đã sao chép liên kết!', 'success');
  };

  if (isDeleting) {
    return null;
  }

  return (
    <>
      <div className="card mb-4 border-0 shadow-sm">
        <div className="card-body">
          {/* Header */}
          <div className="d-flex align-items-center mb-3">
            <div className="cursor-pointer" onClick={() => navigate(`/profile/${author.username || author.id}`)}>
              <Avatar src={authorAvatar} alt={authorName} size="md" />
            </div>
            <div className="ms-2">
              <h6 className="mb-0 cursor-pointer" onClick={() => navigate(`/profile/${author.username || author.id}`)}>
                {authorName}
                <UserBadge user={author} />
              </h6>
              <small className="text-muted">
                {new Date(status.createdAt || (status as any).created_at || Date.now()).toLocaleString('vi-VN')}
                {status.createdAt !== (status as any).updatedAt && (status as any).updatedAt ? ' (đã chỉnh sửa)' : ''}
              </small>
            </div>

            {/* Options Dropdown */}
            <div className="ms-auto position-relative">
              <button
                className="btn btn-link text-muted p-1 text-decoration-none"
                onClick={() => setShowDropdown(!showDropdown)}
                aria-label="Tùy chọn bài viết"
              >
                <i className="bi bi-three-dots fs-5"></i>
              </button>

              {showDropdown && (
                <>
                  {/* Overlay to close dropdown when clicking outside */}
                  <div
                    className="position-fixed top-0 start-0 w-100 h-100"
                    style={{ zIndex: 999 }}
                    onClick={() => setShowDropdown(false)}
                  ></div>

                  {/* Dropdown Menu */}
                  <div className="dropdown-menu show position-absolute end-0 mt-1 shadow border-0 rounded-3 py-1" style={{ zIndex: 1000, minWidth: '220px' }}>
                    {isAuthorOrAdmin && (
                      <>
                        <button
                          className="dropdown-item py-2 d-flex align-items-center gap-2"
                          onClick={() => {
                            setShowDropdown(false);
                            setEditContent(status.content);
                            setIsEditing(true);
                          }}
                        >
                          <i className="bi bi-pencil text-primary"></i> Chỉnh sửa bài viết
                        </button>
                        <button
                          className="dropdown-item py-2 d-flex align-items-center gap-2 text-danger"
                          onClick={handleDeletePost}
                        >
                          <i className="bi bi-trash"></i> Xóa bài viết
                        </button>
                        <hr className="dropdown-divider my-1" />
                      </>
                    )}

                    <button
                      className="dropdown-item py-2 d-flex align-items-center gap-2"
                      onClick={handleToggleSave}
                    >
                      <i className={`bi ${isSaved ? 'bi-bookmark-check-fill text-warning' : 'bi-bookmark text-warning'}`}></i>
                      {isSaved ? 'Bỏ lưu bài viết' : 'Lưu bài viết'}
                    </button>

                    {!isOwner && (
                      <button
                        className="dropdown-item py-2 d-flex align-items-center gap-2 text-muted"
                        onClick={handleOpenReportModal}
                      >
                        <i className="bi bi-flag text-secondary"></i> Báo cáo bài viết
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Content / Edit Form */}
          {isEditing ? (
            <div className="mb-3 bg-light p-3 rounded border">
              <label className="form-label fw-bold small text-muted">Chỉnh sửa nội dung bài viết:</label>
              <textarea
                className="form-control mb-2"
                rows={4}
                value={editContent}
                onChange={e => setEditContent(e.target.value)}
                placeholder="Nhập nội dung bài viết..."
                disabled={isSavingEdit}
              />
              <div className="d-flex justify-content-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditing(false)}
                  disabled={isSavingEdit}
                >
                  Hủy
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSaveEdit}
                  disabled={isSavingEdit}
                >
                  {isSavingEdit ? 'Đang lưu...' : 'Lưu thay đổi'}
                </Button>
              </div>
            </div>
          ) : (
            <p className="card-text text-break mb-3">{status.content}</p>
          )}

          {/* Media */}
          {status.mediaUrls && status.mediaUrls.length > 0 && (
            <div className="mb-3 d-flex flex-wrap gap-2">
              {status.mediaUrls.map((url, index) => (
                <img
                  key={index}
                  src={url}
                  alt="Status media"
                  className="img-fluid rounded"
                  style={{ maxHeight: '400px', objectFit: 'cover' }}
                />
              ))}
            </div>
          )}

          <hr />

          {/* Actions */}
          <div className="d-flex justify-content-between text-muted mb-2 px-2">
            <small>{status.likesCount} Thích</small>
            <small>{status.commentsCount} Bình luận</small>
          </div>

          <div className="d-flex justify-content-between border-top border-bottom py-1 mb-3">
            <Button
              variant="text"
              className={`flex-grow-1 ${status.hasLiked ? 'text-primary' : 'text-muted'}`}
              onClick={() => onLike(status.id)}
            >
              <i className={`bi ${status.hasLiked ? 'bi-heart-fill' : 'bi-heart'} me-1`}></i>
              Thích
            </Button>
            <Button variant="text" className="text-muted flex-grow-1" onClick={handleToggleComments}>
              <i className="bi bi-chat me-1"></i>
              Bình luận
            </Button>
            <Button variant="text" className="text-muted flex-grow-1" onClick={handleShare}>
              <i className="bi bi-share me-1"></i>
              Chia sẻ
            </Button>
            <Button variant="text" className="text-muted flex-grow-1" onClick={handleCopyLink}>
              <i className="bi bi-link-45deg me-1"></i>
              Copy Link
            </Button>
          </div>

          {/* Comments Section */}
          {showComments && (
            <div className="comments-section mt-3">
              <div className="d-flex align-items-end mb-3 gap-2">
                <textarea
                  className="hc-input form-control flex-grow-1"
                  placeholder="Viết bình luận..."
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handlePostComment();
                    }
                  }}
                  rows={2}
                  style={{ resize: 'none' }}
                />
                <Button variant="primary" onClick={handlePostComment} className="mb-0" style={{ height: 'fit-content' }}>
                  Gửi
                </Button>
              </div>

              <div className="comments-list">
                {comments.map((comment, index) => {
                  const commentAuthor = comment.user || comment.User || {};
                  const commentAuthorName = `${commentAuthor.firstName || commentAuthor.first_name || commentAuthor.username || 'Người dùng'} ${commentAuthor.lastName || commentAuthor.last_name || ''}`.trim();
                  return (
                    <div key={index} className="d-flex mb-3">
                      <Avatar src={commentAuthor.avatar || ''} alt={commentAuthorName} size="sm" />
                      <div className="ms-2 flex-grow-1 bg-light p-2 rounded">
                        <h6 className="mb-0 fs-6">
                          {commentAuthorName}
                          <UserBadge user={commentAuthor} />
                        </h6>
                        <p className="mb-0 small">{comment.content}</p>
                        <small className="text-muted" style={{ fontSize: '11px' }}>
                          {new Date(comment.createdAt || comment.created_at || Date.now()).toLocaleString('vi-VN')}
                        </small>
                      </div>
                    </div>
                  );
                })}
                {comments.length === 0 && (
                  <p className="text-center text-muted small">Chưa có bình luận nào. Hãy là người đầu tiên!</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Report Modal */}
      {showReportModal && (
        <div
          className="modal fade show d-block"
          tabIndex={-1}
          style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1050 }}
        >
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content shadow border-0 rounded-4">
              <div className="modal-header border-bottom-0 pb-0">
                <h5 className="modal-title fw-bold d-flex align-items-center gap-2">
                  <i className="bi bi-shield-exclamation text-danger"></i>
                  Báo cáo bài viết
                </h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setShowReportModal(false)}
                  disabled={isSubmittingReport}
                ></button>
              </div>
              <form onSubmit={handleSendReport}>
                <div className="modal-body py-3">
                  <p className="text-muted small mb-3">
                    Nếu bạn nhận thấy bài viết này vi phạm Tiêu chuẩn cộng đồng của HeartConnect, vui lòng chọn lý do dưới đây:
                  </p>

                  <div className="mb-3">
                    <label className="form-label fw-semibold small">Lý do báo cáo:</label>
                    <select
                      className="form-select"
                      value={reportReason}
                      onChange={e => setReportReason(e.target.value)}
                      disabled={isSubmittingReport}
                    >
                      {REPORT_REASONS.map((reason, idx) => (
                        <option key={idx} value={reason}>
                          {reason}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="mb-3">
                    <label className="form-label fw-semibold small">Mô tả thêm (không bắt buộc):</label>
                    <textarea
                      className="form-control"
                      rows={3}
                      placeholder="Cung cấp thêm chi tiết để giúp đội ngũ kiểm duyệt đánh giá chính xác..."
                      value={reportDetails}
                      onChange={e => setReportDetails(e.target.value)}
                      disabled={isSubmittingReport}
                      maxLength={1000}
                    />
                  </div>
                </div>

                <div className="modal-footer border-top-0 pt-0">
                  <button
                    type="button"
                    className="btn btn-outline-secondary rounded-pill px-4"
                    onClick={() => setShowReportModal(false)}
                    disabled={isSubmittingReport}
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    className="btn btn-danger rounded-pill px-4"
                    disabled={isSubmittingReport}
                  >
                    {isSubmittingReport ? 'Đang gửi...' : 'Gửi báo cáo'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
