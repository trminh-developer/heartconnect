import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { CreateStatus, StatusCard } from '../components/feed';
import { StoryTray } from '../components/story';
import { useFeed } from '../hooks';
import { Loading, EmptyState } from '../components/common';

const FeedView = () => {
  const { t } = useTranslation();
  const {
    statuses,
    isLoading,
    isUploading,
    createStatus,
    toggleLike,
    addComment,
    getComments,
    updateStatus,
    deleteStatus,
  } = useFeed();

  const [activeTab, setActiveTab] = useState<'all' | 'saved'>('all');
  const [savedIds, setSavedIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('hc_saved_posts');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    const handleSavedUpdated = () => {
      try {
        const raw = localStorage.getItem('hc_saved_posts');
        setSavedIds(raw ? JSON.parse(raw) : []);
      } catch {
        setSavedIds([]);
      }
    };
    window.addEventListener('hc_saved_posts_updated', handleSavedUpdated);
    return () => window.removeEventListener('hc_saved_posts_updated', handleSavedUpdated);
  }, []);

  const visibleStatuses =
    activeTab === 'saved'
      ? statuses.filter(s => savedIds.includes(s.id))
      : statuses;

  return (
    <div className="container-fluid py-4 fade-in">
      <div className="row justify-content-center">
        <div className="col-12 col-lg-8 col-xl-6">
          <div className="d-flex align-items-center justify-content-between mb-4 flex-wrap gap-2">
            <h2 className="mb-0 fw-bold">{t('feed.title')}</h2>

            {/* Feed Tabs: Tất cả & Đã lưu */}
            <div className="btn-group p-1 bg-light rounded-pill border" role="group">
              <button
                type="button"
                className={`btn btn-sm rounded-pill px-3 fw-semibold ${activeTab === 'all' ? 'btn-danger text-white shadow-sm' : 'btn-light text-muted'}`}
                onClick={() => setActiveTab('all')}
              >
                <i className="bi bi-grid-fill me-1"></i> Tất cả
              </button>
              <button
                type="button"
                className={`btn btn-sm rounded-pill px-3 fw-semibold position-relative ${activeTab === 'saved' ? 'btn-danger text-white shadow-sm' : 'btn-light text-muted'}`}
                onClick={() => setActiveTab('saved')}
              >
                <i className="bi bi-bookmark-fill me-1"></i> Đã lưu
                {savedIds.length > 0 && (
                  <span className="badge bg-secondary rounded-pill ms-1" style={{ fontSize: '10px' }}>
                    {savedIds.length}
                  </span>
                )}
              </button>
            </div>
          </div>

          <StoryTray />

          {activeTab === 'all' && (
            <CreateStatus createStatus={createStatus} isUploading={isUploading} />
          )}

          {isLoading ? (
            <div className="text-center py-5">
              <Loading />
            </div>
          ) : visibleStatuses.length > 0 ? (
            <div className="feed-list">
              {visibleStatuses.map(status => (
                <StatusCard
                  key={status.id}
                  status={status}
                  onLike={toggleLike}
                  onComment={addComment}
                  getComments={getComments}
                  onUpdate={updateStatus}
                  onDelete={deleteStatus}
                />
              ))}
            </div>
          ) : activeTab === 'saved' ? (
            <EmptyState
              title="Chưa có bài viết nào được lưu"
              description="Khi bạn nhấn 'Lưu bài viết' trong menu góc bài viết, các bài viết đó sẽ xuất hiện ở đây để bạn xem lại bất kỳ lúc nào."
              icon="bi-bookmark"
            />
          ) : (
            <EmptyState
              title={t('feed.empty_title')}
              description={t('feed.empty_desc')}
              icon="bi-journal-x"
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default FeedView;
