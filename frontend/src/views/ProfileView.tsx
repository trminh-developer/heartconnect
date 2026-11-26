import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ProfileHeader, ProfileGallery, InterestBadge } from '../components/user';
import { Button, Loading, Modal, Input, Toast, ImageCropperModal, LinkifyText } from '../components/common';
import { useAuth } from '../hooks/useAuth';
import { useChat } from '../hooks/useChat';
import { useMatches } from '../hooks/useMatches';
import { useAlert } from '../contexts/AlertContext';
import { userService, authService, feedService } from '../services';
import { interests as predefinedInterests } from '../data';
import { nextIdentityChange } from '../utils/premium';

const ProfileView = () => {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const { user: currentUser, updateUser } = useAuth();
  const { showAlert } = useAlert();
  const [user, setUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [galleryPhotos, setGalleryPhotos] = useState<string[]>([]);
  
  // Edit modal state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editForm, setEditForm] = useState({ 
    firstName: '', 
    lastName: '', 
    bio: '',
    city: '',
    country: '',
    profession: '',
    education: '',
    avatar: '',
    coverPhoto: '',
    dateOfBirth: '',
    interests: [] as any[]
  });
  const [newInterest, setNewInterest] = useState('');
  const [showToast, setShowToast] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const nextNameChange = nextIdentityChange(currentUser?.nameChangedAt);
  
  // Crop states
  const [cropImageSrc, setCropImageSrc] = useState<string>('');
  const [cropField, setCropField] = useState<'avatar' | 'coverPhoto' | null>(null);
  const [isCropModalOpen, setIsCropModalOpen] = useState(false);
  const [cropAspect, setCropAspect] = useState(1);
  
  const isOwnProfile = !id || id === currentUser?.username || id === currentUser?.id;
  const navigate = useNavigate();

  useEffect(() => {
    const fetchUser = async () => {
      setIsLoading(true);
      try {
        let targetUserId = isOwnProfile && currentUser ? currentUser.id : '';
        if (isOwnProfile && currentUser) {
          setUser(currentUser);
          setEditForm({
            firstName: currentUser.firstName || '',
            lastName: currentUser.lastName || '',
            bio: currentUser.bio || '',
            city: currentUser.location?.city || '',
            country: currentUser.location?.country || '',
            profession: currentUser.profession || '',
            education: currentUser.education || '',
            avatar: currentUser.avatar || '',
            coverPhoto: currentUser.coverPhoto || '',
            dateOfBirth: currentUser.dateOfBirth || '',
            interests: currentUser.interests || []
          });
        } else if (id) {
          let fetchedUser = await userService.getUserByUsername(id);
          if (!fetchedUser) {
            fetchedUser = await userService.getUserById(id);
          }
          setUser(fetchedUser);
          targetUserId = fetchedUser?.id || '';
        }
        
        // Fetch statuses to populate gallery
        if (targetUserId) {
          const statuses = await feedService.getStatuses(targetUserId);
          const allPhotos = (statuses as any[]).reduce<string[]>((acc: string[], status: any) => {
            if (status.mediaUrls && status.mediaUrls.length > 0) {
              return [...acc, ...status.mediaUrls];
            }
            return acc;
          }, []);
          setGalleryPhotos(allPhotos);
        }

      } catch (error) {
        console.error("Error fetching user profile", error);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchUser();
  }, [id, isOwnProfile, currentUser]);

  const handleEditChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value;
    setEditForm({ ...editForm, [e.target.name]: value });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, field: 'avatar' | 'coverPhoto') => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setCropImageSrc(reader.result as string);
        setCropField(field);
        setCropAspect(field === 'avatar' ? 1 : 16 / 9);
        setIsCropModalOpen(true);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCropComplete = (croppedBase64: string) => {
    if (cropField) {
      setEditForm(prev => ({ ...prev, [cropField]: croppedBase64 }));
    }
    setIsCropModalOpen(false);
  };

  const handleAddInterest = () => {
    if (newInterest.trim()) {
      const interestObj = {
        id: Date.now().toString(),
        name: newInterest.trim(),
        icon: 'bi-heart-fill'
      };
      setEditForm({ ...editForm, interests: [...editForm.interests, interestObj] });
      setNewInterest('');
    }
  };

  const handleAddPredefinedInterest = (interest: any) => {
    if (!editForm.interests.find((i: any) => i.id === interest.id || i.name.toLowerCase() === interest.name.toLowerCase())) {
      setEditForm({ ...editForm, interests: [...editForm.interests, interest] });
    }
  };

  const handleRemoveInterest = (id: string) => {
    setEditForm({ ...editForm, interests: editForm.interests.filter(i => i.id !== id) });
  };

  const handleSaveProfile = async () => {
    if (!currentUser || isSaving) return;
    setIsSaving(true);
    try {
      const updatedUser = await updateUser({
        firstName: editForm.firstName !== currentUser.firstName ? editForm.firstName : undefined,
        lastName: editForm.lastName !== currentUser.lastName ? editForm.lastName : undefined,
        bio: editForm.bio,
        location: {
          city: editForm.city,
          country: editForm.country
        },
        profession: editForm.profession,
        education: editForm.education,
        avatar: editForm.avatar,
        coverPhoto: editForm.coverPhoto,
        dateOfBirth: editForm.dateOfBirth,
        interests: editForm.interests
      });

      setUser(updatedUser);
      setIsEditModalOpen(false);
      setShowToast(true);
      setTimeout(() => setShowToast(false), 2000);
    } catch (error: any) {
      console.error("Error saving profile", error);
      showAlert(error.response?.data?.error || error.message || 'Không thể lưu hồ sơ.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const { conversations, selectConversation, loadConversations } = useChat();

  const { likeUser } = useMatches();

  const existingConv = conversations?.find(c => 
    c.participants.some(p => p.id === user?.id)
  );
  const isMatched = !!existingConv;

  const handleMessage = () => {
    if (!user) return;
    if (existingConv) {
      selectConversation(existingConv.id);
      navigate('/messages');
    } else {
      showAlert('Bạn và người này chưa kết đôi. Hãy thả tim trước nhé!', 'warning');
    }
  };

  const handleBlock = async () => {
    if (!currentUser || !user) return;
    try {
      await userService.blockUser(currentUser.id, user.id);
      showAlert('Đã chặn người dùng này.', 'warning');
      navigate('/discover');
    } catch (error: any) {
      showAlert(error.response?.data?.error || t('discover.action_error'), 'error');
    }
  };

  const handleReport = async () => {
    if (!currentUser || !user) return;
    try {
      await userService.reportUser(currentUser.id, user.id, 'Báo cáo từ hồ sơ');
      showAlert('Đã gửi báo cáo tới quản trị viên.', 'info');
    } catch (error: any) {
      showAlert(error.response?.data?.error || 'Không thể gửi báo cáo.', 'error');
    }
  };

  const handleLike = async () => {
    if (!user) return;
    try {
      const matched = await likeUser(user.id);
      showAlert(t(matched ? 'discover.mutual_match' : 'discover.like_sent'), 'success');
      if (matched && loadConversations) await loadConversations();
    } catch (error: any) {
      showAlert(error.response?.data?.error || t('discover.action_error'), 'error');
    }
  };

  if (isLoading) return <Loading text={t('profile.loading')} />;
  if (!user) return <div>{t('profile.not_found')}</div>;

  return (
    <div className="profile-view fade-in position-relative">
      <ProfileHeader user={user} />
      
      <div className="row mt-4">
        <div className="col-md-4 mb-4">
          <div className="hc-card p-4">
            <h5 className="mb-3">{t('profile.bio')}</h5>
            <div className="text-dark">
              <LinkifyText text={user.bio || t('profile.no_bio')} />
            </div>
            
            <h5 className="mb-3 mt-4">{t('profile.interests')}</h5>
            <div className="d-flex flex-wrap gap-2">
              {user.interests?.map((interest: any, i: number) => (
                <InterestBadge key={i} interest={typeof interest === 'string' ? { id: String(i), name: interest, icon: 'bi-star' } as any : interest} />
              )) || <span className="text-muted">{t('profile.not_updated')}</span>}
            </div>

            <div className="mt-4">
              {isOwnProfile ? (
                <Button variant="primary" className="w-100" onClick={() => setIsEditModalOpen(true)}>
                  {t('profile.edit_btn')}
                </Button>
              ) : (
                <div className="d-flex flex-column gap-2">
                  {isMatched ? (
                    <Button variant="light" disabled className="text-danger border-danger">
                      <i className="bi bi-heart-fill me-2"></i> {t('profile.matched_status')}
                    </Button>
                  ) : (
                    <Button variant="danger" onClick={handleLike}><i className="bi bi-heart-fill me-2"></i> {t('common.like')}</Button>
                  )}
                  <Button variant="primary" onClick={handleMessage}>{t('common.message')}</Button>
                  <Button variant="secondary" onClick={handleBlock}>{t('common.block')}</Button>
                  <Button variant="warning" onClick={handleReport}>{t('common.report')}</Button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="col-md-8">
          {galleryPhotos && galleryPhotos.length > 0 && (
            <div className="hc-card p-4">
              <h5 className="mb-3">{t('profile.gallery')}</h5>
              <ProfileGallery photos={galleryPhotos} />
            </div>
          )}
        </div>
      </div>

      {/* Edit Profile Modal */}
      <Modal 
        isOpen={isEditModalOpen} 
        title={t('profile.edit_modal_title')} 
        onClose={() => setIsEditModalOpen(false)}
      >
        <div className="row">
          <div className="col-md-6 mb-3">
            <label className="form-label">{t('profile.first_name')}</label>
            <input type="text" className="form-control" name="firstName" value={editForm.firstName} onChange={handleEditChange} disabled={!!nextNameChange} maxLength={50} />
          </div>
          <div className="col-md-6 mb-3">
            <label className="form-label">{t('profile.last_name')}</label>
            <input type="text" className="form-control" name="lastName" value={editForm.lastName} onChange={handleEditChange} disabled={!!nextNameChange} maxLength={50} />
          </div>
        </div>

        <p className="small text-muted">
          {nextNameChange ? `Có thể đổi tên lại từ ${nextNameChange.toLocaleString('vi-VN')}.` : 'Sau khi đổi tên, bạn cần chờ 7 ngày để đổi lại.'}
        </p>
        <div className="mb-3">
          <label className="form-label">{t('profile.birth_date')}</label>
          <input 
            type="date" 
            className="form-control" 
            name="dateOfBirth" 
            value={editForm.dateOfBirth} 
            onChange={handleEditChange} 
            max={new Date().toISOString().split("T")[0]}
          />
        </div>

        <div className="row">
          <div className="col-md-6 mb-3">
            <Input label={t('profile.city')} name="city" value={editForm.city} onChange={handleEditChange} />
          </div>
          <div className="col-md-6 mb-3">
            <Input label={t('profile.country')} name="country" value={editForm.country} onChange={handleEditChange} />
          </div>
        </div>
        <div className="row">
          <div className="col-md-6 mb-3">
            <Input label={t('profile.profession')} name="profession" value={editForm.profession} onChange={handleEditChange} />
          </div>
          <div className="col-md-6 mb-3">
            <Input label={t('profile.education')} name="education" value={editForm.education} onChange={handleEditChange} />
          </div>
        </div>
        <div className="mb-3">
          <label className="form-label">Avatar</label>
          <div className="d-flex align-items-center gap-3">
            {editForm.avatar && (
              <img src={editForm.avatar} alt="Avatar" className="rounded-circle border" style={{ width: 50, height: 50, objectFit: 'cover' }} />
            )}
            <input 
              type="file" 
              className="form-control" 
              accept="image/*" 
              onChange={(e) => handleFileChange(e, 'avatar')} 
            />
          </div>
        </div>
        <div className="mb-3">
          <label className="form-label">Cover Photo</label>
          <div className="d-flex flex-column gap-2">
            {editForm.coverPhoto && (
              <img src={editForm.coverPhoto} alt="Cover" className="rounded border" style={{ width: '80%', height: '140px', objectFit: 'cover', margin: '0 auto' }} />
            )}
            <input 
              type="file" 
              className="form-control" 
              accept="image/*" 
              onChange={(e) => handleFileChange(e, 'coverPhoto')} 
            />
          </div>
        </div>
        <div className="mb-3">
          <label className="form-label">{t('profile.interests')}</label>
          <div className="d-flex flex-wrap gap-2 mb-2">
            {editForm.interests.map(interest => (
              <span key={interest.id} className="interest-badge d-flex align-items-center gap-1">
                <i className={`bi ${interest.icon}`}></i> {interest.name}
                <i className="bi bi-x-circle-fill ms-1 text-danger" style={{ cursor: 'pointer' }} onClick={() => handleRemoveInterest(interest.id)}></i>
              </span>
            ))}
          </div>
          <div className="input-group mb-3">
            <input 
              type="text" 
              className="form-control" 
              placeholder="Tag..." 
              value={newInterest} 
              onChange={e => setNewInterest(e.target.value)} 
              onKeyDown={e => e.key === 'Enter' ? handleAddInterest() : null} 
            />
            <button className="btn btn-outline-primary" type="button" onClick={handleAddInterest}>+</button>
          </div>
          
          <div className="d-flex flex-wrap gap-2" style={{ maxHeight: '150px', overflowY: 'auto', padding: '4px' }}>
            {predefinedInterests
              .filter(i => !editForm.interests.find((ei: any) => ei.id === i.id || ei.name.toLowerCase() === i.name.toLowerCase()))
              .map(interest => (
                <span 
                  key={interest.id} 
                  className="interest-badge interest-badge-light text-dark border d-flex align-items-center gap-1" 
                  style={{ cursor: 'pointer', background: 'var(--hc-surface-soft)' }}
                  onClick={() => handleAddPredefinedInterest(interest)}
                >
                  <i className={`bi ${interest.icon} text-primary`}></i> {interest.name}
                  <i className="bi bi-plus text-primary"></i>
                </span>
            ))}
          </div>
        </div>
        <div className="mb-3">
          <label className="form-label">{t('profile.bio')}</label>
          <textarea 
            className="form-control" 
            name="bio" 
            rows={3} 
            value={editForm.bio} 
            onChange={handleEditChange} 
          />
        </div>
        
        <div className="d-flex justify-content-end gap-2 mt-4 pt-3 border-top">
          <Button variant="ghost" onClick={() => setIsEditModalOpen(false)}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={handleSaveProfile} disabled={isSaving}>{isSaving ? 'Đang lưu...' : t('common.save')}</Button>
        </div>
      </Modal>

      {/* Crop Modal */}
      {isCropModalOpen && cropImageSrc && (
        <ImageCropperModal
          isOpen={isCropModalOpen}
          onClose={() => setIsCropModalOpen(false)}
          imageSrc={cropImageSrc}
          onCropComplete={handleCropComplete}
          aspect={cropAspect}
          circularCrop={cropField === 'avatar'}
        />
      )}

      <div style={{ position: 'fixed', bottom: '20px', right: '20px', zIndex: 9999 }}>
        <Toast show={showToast} message="Success" type="success" onClose={() => setShowToast(false)} />
      </div>
    </div>
  );
};

export default ProfileView;
