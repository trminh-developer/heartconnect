import React, { useState, useEffect, useRef, useCallback } from "react";
import { Button, Toast, Modal, Input } from "../components/common";
import { useAuth } from "../hooks/useAuth";
import { Gender, RelationshipGoal, UserProfileUpdate } from "../models";
import { useAlert } from "../contexts/AlertContext";
import { useTheme } from "../contexts/ThemeContext";
import { useTranslation } from "react-i18next";
import { isPremiumActive, nextIdentityChange } from '../utils/premium';

const SettingsView = () => {
  const { user, logout, updateUser } = useAuth();
  const { showAlert } = useAlert();
  const { isDarkMode, toggleTheme, setTheme } = useTheme();
  const { t, i18n } = useTranslation();
  const currentLang = (i18n.language || 'vi').startsWith('en') ? 'en' : 'vi';



  // Initialize state from user data
  const [onlineStatus, setOnlineStatus] = useState(user?.isOnline ?? true);
  const [preferredGender, setPreferredGender] = useState<Gender | 'ALL'>(
    user?.datingPreference?.preferredGender?.length === 1 ? user.datingPreference.preferredGender[0]! : 'ALL',
  );
  const [ageMin, setAgeMin] = useState(
    user?.datingPreference?.ageRange?.min || 18,
  );
  const [ageMax, setAgeMax] = useState(
    user?.datingPreference?.ageRange?.max || 100,
  );
  const [maxDistance, setMaxDistance] = useState(
    user?.datingPreference?.maxDistance || 100,
  );
  const [relationshipGoal, setRelationshipGoal] = useState(
    user?.datingPreference?.relationshipGoal || user?.relationshipGoal || RelationshipGoal.NOT_SURE,
  );
  const [showToast, setShowToast] = useState(false);

  const [isEditingUsername, setIsEditingUsername] = useState(false);
  const [editUsername, setEditUsername] = useState(user?.username || "");
  const [isSavingUsername, setIsSavingUsername] = useState(false);
  const [isSavingLogo, setIsSavingLogo] = useState(false);
  const nextUsernameChange = nextIdentityChange(user?.usernameChangedAt);
  const premiumActive = isPremiumActive(user);

  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [isVerificationModalOpen, setIsVerificationModalOpen] = useState(false);
  const [verificationStep, setVerificationStep] = useState(1);
  const [isVerificationPending, setIsVerificationPending] = useState(false);

  const [isScanningId, setIsScanningId] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraGeneration = useRef(0);
  const [idCardImage, setIdCardImage] = useState<string | null>(null);
  const [recordedVideo, setRecordedVideo] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [livenessInstruction, setLivenessInstruction] = useState("Vui lòng nhìn thẳng vào camera");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingStopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  
  const handleIdCardUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setIdCardImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const startCamera = useCallback(async () => {
    const generation = ++cameraGeneration.current;
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      if (generation !== cameraGeneration.current) {
        mediaStream.getTracks().forEach(track => track.stop());
        return;
      }
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = mediaStream;
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      console.error("Lỗi mở camera", err);
      if (generation === cameraGeneration.current) showAlert("Không thể mở camera. Vui lòng cấp quyền truy cập.", "error");
    }
  }, [showAlert]);

  const stopCamera = useCallback(() => {
    cameraGeneration.current++;
    if (recordingInterval.current) clearInterval(recordingInterval.current);
    if (recordingStopTimer.current) clearTimeout(recordingStopTimer.current);
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = null;
      recorder.stop();
    }
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    setStream(null);
    setIsRecording(false);
  }, []);

  
  const startRecording = () => {
    if (!stream) return;
    if (typeof MediaRecorder === 'undefined') {
      showAlert('Trình duyệt này không hỗ trợ ghi hình. Vui lòng dùng trình duyệt khác.', 'error');
      return;
    }
    const mimeType = ['video/webm', 'video/mp4'].find(type => MediaRecorder.isTypeSupported(type));
    if (!mimeType) {
      showAlert('Trình duyệt này không hỗ trợ định dạng ghi hình.', 'error');
      return;
    }
    setIsRecording(true);
    chunksRef.current = [];
    const mediaRecorder = new MediaRecorder(stream, { mimeType });
    mediaRecorderRef.current = mediaRecorder;
    
    mediaRecorder.ondataavailable = (e: any) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    
    mediaRecorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType });
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = () => {
        setRecordedVideo(reader.result as string);
      };
    };
    
    mediaRecorder.start(200); // 200ms chunks
    
    // Simulate liveness instructions sequence
    const instructions = [
      "Vui lòng nhìn thẳng vào camera",
      "Từ từ xoay mặt sang TRÁI",
      "Từ từ xoay mặt sang PHẢI",
      "Nhìn lên TRÊN",
      "Nhìn xuống DƯỚI",
      "Đưa thiết bị ra XA một chút",
      "Đang xử lý..."
    ];
    
    let step = 0;
    setLivenessInstruction(instructions[0] || '');
    
    recordingInterval.current = setInterval(() => {
      step++;
      if (step < instructions.length) {
        setLivenessInstruction(instructions[step] || '');
      }
      if (step >= instructions.length - 1) {
        if (recordingInterval.current) clearInterval(recordingInterval.current);
        recordingStopTimer.current = setTimeout(() => {
          if (mediaRecorder.state !== 'inactive') mediaRecorder.stop();
          setIsRecording(false);
          stopCamera();
        }, 1000);
      }
    }, 2000); // 2 seconds per instruction
  };
  
  const retakeVideo = () => {
    setRecordedVideo(null);
    setLivenessInstruction("Vui lòng nhìn thẳng vào camera");
  };
  useEffect(() => {
    if (isVerificationModalOpen && verificationStep === 2 && !recordedVideo) {
      startCamera();
    } else {
      stopCamera();
    }
    return stopCamera;
  }, [isVerificationModalOpen, verificationStep, recordedVideo, startCamera, stopCamera]);

  useEffect(() => {
    if (user) {
      setOnlineStatus(user.isOnline ?? true);
      setPreferredGender(
        user.datingPreference?.preferredGender?.length === 1 ? user.datingPreference.preferredGender[0]! : 'ALL',
      );
      setAgeMin(user.datingPreference?.ageRange?.min || 18);
      setAgeMax(user.datingPreference?.ageRange?.max || 100);
      setMaxDistance(user.datingPreference?.maxDistance || 100);
      setRelationshipGoal(user.datingPreference?.relationshipGoal || user.relationshipGoal || RelationshipGoal.NOT_SURE);
      if (!isEditingUsername) {
        setEditUsername(user.username || "");
      }
    }
  }, [user, isEditingUsername]);

  // Helper to trigger save and show toast
  const saveChanges = async (updatedFields: UserProfileUpdate): Promise<boolean> => {
    if (user) {
      try {
        await updateUser(updatedFields);
        setShowToast(true);
        setTimeout(() => setShowToast(false), 2000);
        return true;
      } catch (error: any) {
        showAlert(error.response?.data?.error || error.message || 'Không thể lưu thay đổi.', 'error');
      }
    }
    return false;
  };

  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type) || file.size > 1024 * 1024) {
      showAlert('Chọn ảnh PNG, JPEG, WebP hoặc GIF có dung lượng tối đa 1 MB.', 'error');
      return;
    }
    setIsSavingLogo(true);
    try {
      const appLogo = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('Không thể đọc ảnh.'));
        reader.readAsDataURL(file);
      });
      await saveChanges({ appLogo });
    } catch (error: any) {
      showAlert(error.message, 'error');
    } finally {
      setIsSavingLogo(false);
    }
  };

  const handleToggleOnline = () => {
    const newVal = !onlineStatus;
    setOnlineStatus(newVal);
    saveChanges({ isOnline: newVal });
  };

  const handleGenderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value as Gender | 'ALL';
    setPreferredGender(val);
    saveChanges({
      datingPreference: {
        preferredGender: val === 'ALL' ? [] : [val],
      },
    });
  };

  const handleAgeChange = (min: number, max: number) => {
    setAgeMin(min);
    setAgeMax(max);
    saveChanges({
      datingPreference: {
        ageRange: { min, max },
      },
    });
  };

  const handleDistanceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value);
    setMaxDistance(val);
    saveChanges({
      datingPreference: {
        maxDistance: val,
      },
    });
  };

  const handleGoalChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value as RelationshipGoal;
    setRelationshipGoal(val);
    saveChanges({ relationshipGoal: val, datingPreference: { relationshipGoal: val } });
  };

  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      showAlert("Trình duyệt của bạn không hỗ trợ định vị", "error");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        const saved = await saveChanges({
          refreshLocation: true,
          location: {
            ...user?.location,
            city: user?.location?.city || "Unknown",
            country: user?.location?.country || "Unknown",
            latitude,
            longitude,
          },
        });
        if (saved) showAlert("Đã cập nhật vị trí chính xác của bạn!", "success");
      },
      (error) => {
        showAlert(
          "Không thể lấy vị trí. Vui lòng cấp quyền truy cập vị trí cho trang web.",
          "error",
        );
      },
      { enableHighAccuracy: true },
    );
  };

  return (
    <div className="settings-view fade-in position-relative">
      <h3 className="mb-4">{t('settings.title')}</h3>

      <div className="hc-card mb-4 settings-section">
        <div className="hc-card-header settings-section-title">
          <h5 className="mb-0">{t('settings.account')}</h5>
        </div>
        <div className="hc-card-body">
          <div className="settings-item mb-3 d-flex justify-content-between align-items-center">
            <span>Email</span>
            <span className="text-muted">{user?.email}</span>
          </div>
          <div className="settings-item mb-3 d-flex justify-content-between align-items-center">
            <span>{t('settings.username')}</span>
            {isEditingUsername ? (
              <div className="d-flex gap-2">
                <input
                  type="text"
                  className="form-control form-control-sm"
                  value={editUsername}
                  minLength={3}
                  maxLength={30}
                  disabled={isSavingUsername}
                  onChange={(e) => setEditUsername(e.target.value)}
                />
                <Button
                  className="btn-primary btn-sm"
                  disabled={isSavingUsername || !!nextUsernameChange}
                  onClick={async () => {
                    setIsSavingUsername(true);
                    if (await saveChanges({ username: editUsername.trim() })) setIsEditingUsername(false);
                    setIsSavingUsername(false);
                  }}
                >
                  {t('common.save')}
                </Button>
                <Button
                  className="btn-outline-secondary btn-sm"
                  onClick={() => {
                    setEditUsername(user?.username || "");
                    setIsEditingUsername(false);
                  }}
                >
                  {t('common.cancel')}
                </Button>
              </div>
            ) : (
              <div className="d-flex align-items-center gap-2">
                <span className="text-muted fw-bold">@{user?.username}</span>
                <button
                  type="button"
                  className="btn btn-link p-0 ms-2"
                  aria-label="Đổi username"
                  disabled={!!nextUsernameChange}
                  onClick={() => setIsEditingUsername(true)}
                ><i className="bi bi-pencil" /></button>
              </div>
            )}
          </div>
          <p className="small text-muted">
            {nextUsernameChange ? `Có thể đổi username lại từ ${nextUsernameChange.toLocaleString('vi-VN')}.` : 'Sau khi đổi username, bạn cần chờ 7 ngày để đổi lại.'}
          </p>
          <div className="border rounded-3 p-3 my-3">
            <h6>Logo ứng dụng <span className="badge bg-warning text-dark">Premium</span></h6>
            <p className="small text-muted">Logo hiển thị riêng cho tài khoản của bạn trong thời gian gói Premium còn hiệu lực. Bạn có thể đổi bất cứ lúc nào.</p>
            <img src={premiumActive && user?.appLogo ? user.appLogo : '/logo-heartconnect.png'} alt="Logo hiện tại" height="48" className="mb-3" style={{ maxWidth: 160, objectFit: 'contain' }} />
            {premiumActive ? (
              <div className="d-flex flex-column gap-2">
                <input type="file" className="form-control" accept="image/png,image/jpeg,image/webp,image/gif" aria-label="Chọn logo ứng dụng" onChange={handleLogoUpload} disabled={isSavingLogo} />
                <small className="text-muted">PNG, JPEG, WebP hoặc GIF, tối đa 1 MB.</small>
                {isSavingLogo && <small>Đang lưu logo...</small>}
                {user?.appLogo && <Button variant="outline" disabled={isSavingLogo} onClick={async () => {
                  setIsSavingLogo(true);
                  await saveChanges({ appLogo: '' });
                  setIsSavingLogo(false);
                }}>Dùng logo mặc định</Button>}
              </div>
            ) : <a href="/premium">Nâng cấp Premium để đổi logo</a>}
          </div>
          <Button
            className="btn-link p-0 text-decoration-none mt-2 d-block"
            onClick={() => setIsChangingPassword(true)}
          >
            {t('settings.change_password')}
          </Button>
          <hr className="my-3" />
          <div className="settings-item d-flex justify-content-between align-items-center">
            <span>{t('settings.verify_identity')}</span>
            {user?.isVerified ? (
              <span className="text-primary fw-bold"><i className="bi bi-patch-check-fill me-1"></i>Đã xác thực</span>
            ) : isVerificationPending ? (
              <span className="text-warning"><i className="bi bi-hourglass-split me-1"></i>Đang chờ duyệt</span>
            ) : (
              <label className="form-check form-switch toggle-switch mb-0">
                <input
                  className="form-check-input"
                  type="checkbox"
                  checked={isVerificationModalOpen}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setIsVerificationModalOpen(true);
                      setVerificationStep(1);
                    } else {
                      setIsVerificationModalOpen(false);
                    }
                  }}
                />
                <span className="toggle-slider"></span>
              </label>
            )}
          </div>
        </div>
      </div>

      <div className="hc-card mb-4 settings-section">
        <div className="hc-card-header settings-section-title">
          <h5 className="mb-0">{t('settings.privacy')}</h5>
        </div>
        <div className="hc-card-body">
          <div className="settings-item mb-3 d-flex justify-content-between align-items-center">
            <span>{t('settings.show_online')}</span>
            <label className="form-check form-switch toggle-switch">
              <input
                className="form-check-input"
                type="checkbox"
                checked={onlineStatus}
                onChange={handleToggleOnline}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>
          <div className="settings-item mb-3 d-flex justify-content-between align-items-center">
            <span>GPS</span>
            <Button
              className="btn-outline-primary btn-sm"
              onClick={handleGetLocation}
            >
              <i className="bi bi-geo-alt me-1"></i> GPS
            </Button>
          </div>
          {user?.location?.latitude && user?.location?.longitude && (
            <div className="settings-item text-muted small text-end fst-italic">
              {user.location.latitude.toFixed(4)},{" "}
              {user.location.longitude.toFixed(4)}
            </div>
          )}
          </div>
        </div>

        <div className="hc-card mb-4 settings-section">
          <div className="hc-card-header settings-section-title">
            <h5 className="mb-0">{t('settings.dating_pref')}</h5>
          </div>
          <div className="hc-card-body">
            <div className="settings-item mb-3 flex-column align-items-stretch border-0 p-0 pb-3">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <label className="form-label mb-0 fw-medium">{t('settings.interested_in')}</label>
                <select
                  className="form-select form-select-sm w-auto"
                  value={preferredGender}
                  onChange={handleGenderChange}
                >
                  <option value="ALL">{t('discover.all_genders')}</option>
                  <option value={Gender.FEMALE}>{t('common.female')}</option>
                  <option value={Gender.MALE}>{t('common.male')}</option>
                  <option value={Gender.OTHER}>{t('common.other')}</option>
                </select>
              </div>
            </div>

            <div className="settings-item mb-3 flex-column align-items-stretch border-0 p-0 pb-3">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <label className="form-label mb-0 fw-medium">{t('settings.age_range')}</label>
                <div className="d-flex align-items-center gap-2" style={{ maxWidth: "160px" }}>
                  <input
                    type="number"
                    className="form-control form-control-sm text-center"
                    value={ageMin}
                    min="18"
                    max={ageMax}
                    onChange={(e) => setAgeMin(parseInt(e.target.value) || 18)}
                    onBlur={() => handleAgeChange(ageMin, ageMax)}
                  />
                  <span className="text-muted">-</span>
                  <input
                    type="number"
                    className="form-control form-control-sm text-center"
                    value={ageMax}
                    min={ageMin}
                    max="100"
                    onChange={(e) => setAgeMax(parseInt(e.target.value) || 30)}
                    onBlur={() => handleAgeChange(ageMin, ageMax)}
                  />
                </div>
              </div>
            </div>

            <div className="settings-item mb-3 flex-column align-items-stretch border-0 p-0 pb-3">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <label className="form-label mb-0 fw-medium">{t('settings.max_distance')}</label>
                <span className="text-primary fw-bold">{maxDistance} km</span>
              </div>
              <input
                type="range"
                className="form-range w-100"
                min="1"
                max="100"
                value={maxDistance}
                onChange={(e) => setMaxDistance(parseInt(e.target.value))}
                onMouseUp={() => saveChanges({ datingPreference: { maxDistance } })}
                onTouchEnd={() => saveChanges({ datingPreference: { maxDistance } })}
                onKeyUp={(event) => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) void saveChanges({ datingPreference: { maxDistance } }); }}
              />
              <label className="form-check mt-2 small">
                <input className="form-check-input" type="checkbox" checked={user?.datingPreference?.distanceRequired ?? false}
                  onChange={event => void saveChanges({ datingPreference: { distanceRequired: event.target.checked } })} />
                <span className="form-check-label">{t('discover.strict_distance')}</span>
              </label>
            </div>

            <div className="settings-item flex-column align-items-stretch border-0 p-0">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <label className="form-label mb-0 fw-medium">{t('settings.relationship_goal')}</label>
                <select
                  className="form-select form-select-sm w-auto"
                  value={relationshipGoal}
                  onChange={handleGoalChange}
                >
                  <option value={RelationshipGoal.LONG_TERM}>Serious Relationship</option>
                  <option value={RelationshipGoal.SHORT_TERM}>Casual Dating</option>
                  <option value={RelationshipGoal.FRIENDSHIP}>New Friends</option>
                  <option value={RelationshipGoal.NOT_SURE}>Not Sure Yet</option>
                </select>
              </div>
              <label className="form-check mt-2 small">
                <input className="form-check-input" type="checkbox" checked={user?.datingPreference?.goalRequired ?? false}
                  onChange={event => void saveChanges({ datingPreference: { goalRequired: event.target.checked } })} />
                <span className="form-check-label">{t('discover.strict_goal')}</span>
              </label>
              <label className="form-label small mt-2">{t('discover.accepted_goals')}</label>
              <div className="d-flex flex-wrap gap-3">
                {[RelationshipGoal.LONG_TERM, RelationshipGoal.SHORT_TERM, RelationshipGoal.FRIENDSHIP].filter(goal => goal !== relationshipGoal).map(goal => (
                  <label className="form-check small" key={goal}>
                    <input className="form-check-input" type="checkbox" checked={user?.datingPreference?.acceptedGoals?.includes(goal) ?? false}
                      onChange={event => {
                        const current = user?.datingPreference?.acceptedGoals || [];
                        const acceptedGoals = event.target.checked ? [...current, goal] : current.filter(value => value !== goal);
                        void saveChanges({ datingPreference: { acceptedGoals } });
                      }} />
                    <span className="form-check-label">{goal}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Appearance & Theme Section */}
        <div className="hc-card mb-4 settings-section">
          <div className="hc-card-header settings-section-title">
            <h5 className="mb-0 d-flex align-items-center gap-2">
              <i className="bi bi-palette text-primary"></i>
              {t('settings.appearance')}
            </h5>
          </div>
          <div className="hc-card-body">
            {/* Dark Mode */}
            <div className="settings-item d-flex justify-content-between align-items-center border-0 p-0 mb-3">
              <div>
                <label className="form-label mb-0 fw-medium d-block">{t('settings.dark_mode_title')}</label>
                <small className="text-muted">{t('settings.dark_mode_desc')}</small>
              </div>
              <div className="form-check form-switch m-0 p-0">
                <input 
                  className="form-check-input ms-0 fs-5" 
                  type="checkbox" 
                  checked={isDarkMode} 
                  onChange={toggleTheme}
                  style={{ cursor: "pointer" }}
                />
              </div>
            </div>

            <div className="d-flex gap-3 pt-2 mb-4">
              <button 
                type="button" 
                className={`btn flex-fill d-flex align-items-center justify-content-center gap-2 py-2 rounded-3 border ${!isDarkMode ? 'btn-primary text-white' : 'btn-outline-secondary'}`}
                onClick={() => setTheme('light')}
              >
                <i className="bi bi-sun-fill"></i>
                <span>{t('settings.light_mode_btn')}</span>
              </button>
              <button 
                type="button" 
                className={`btn flex-fill d-flex align-items-center justify-content-center gap-2 py-2 rounded-3 border ${isDarkMode ? 'btn-primary text-white' : 'btn-outline-secondary'}`}
                onClick={() => setTheme('dark')}
              >
                <i className="bi bi-moon-stars-fill"></i>
                <span>{t('settings.dark_mode_btn')}</span>
              </button>
            </div>

            {/* Language Synchronized Switcher */}
            <div className="settings-item d-flex justify-content-between align-items-center border-0 p-0 mb-3 pt-3 border-top">
              <div>
                <label className="form-label mb-0 fw-medium d-block">
                  <i className="bi bi-globe me-2 text-primary"></i>
                  {t('settings.language_title')}
                </label>
                <small className="text-muted">{t('settings.language_desc')}</small>
              </div>
            </div>

            <div className="d-flex gap-3 pt-1">
              <button 
                type="button" 
                className={`btn flex-fill d-flex align-items-center justify-content-center gap-2 py-2 rounded-3 border ${currentLang === 'vi' ? 'btn-danger text-white shadow-sm' : 'btn-outline-secondary'}`}
                onClick={() => i18n.changeLanguage('vi')}
              >
                <span className="fw-medium">🇻🇳 {t('settings.vietnamese')}</span>
              </button>
              <button 
                type="button" 
                className={`btn flex-fill d-flex align-items-center justify-content-center gap-2 py-2 rounded-3 border ${currentLang === 'en' ? 'btn-danger text-white shadow-sm' : 'btn-outline-secondary'}`}
                onClick={() => i18n.changeLanguage('en')}
              >
                <span className="fw-medium">🇬🇧 {t('settings.english')}</span>
              </button>
            </div>
          </div>
        </div>


        <div className="hc-card mb-4 settings-section border-danger border">
          <div className="hc-card-body">
            <Button className="btn-danger w-100 mb-3" onClick={logout}>
              {t('settings.logout_btn')}
            </Button>
            <Button className="btn-outline-danger w-100">{t('settings.delete_account')}</Button>
          </div>
        </div>


      <div
        style={{
          position: "fixed",
          bottom: "20px",
          right: "20px",
          zIndex: 9999,
        }}
      >
        <Toast
          show={showToast}
          message="Đã lưu cài đặt!"
          type="success"
          onClose={() => setShowToast(false)}
        />
      </div>

      {/* Modal đổi mật khẩu */}
      <Modal
        isOpen={isChangingPassword}
        onClose={() => {
          setIsChangingPassword(false);
          setCurrentPassword("");
          setNewPassword("");
          setConfirmPassword("");
        }}
        title="Đổi mật khẩu"
      >
        <div className="p-3">
          <div className="mb-3">
            <label className="form-label text-muted small mb-1">
              Current password
            </label>
            <Input
              type="password"
              placeholder="Current password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>
          <div className="mb-3">
            <label className="form-label text-muted small mb-1">
              New password
            </label>
            <Input
              type="password"
              placeholder="New password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <div className="mb-3">
            <label className="form-label text-muted small mb-1">
              Confirm password
            </label>
            <Input
              type="password"
              placeholder="Confirm password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
          <div className="d-flex justify-content-end gap-2 mt-4">
            <Button
              className="btn-secondary"
              onClick={() => {
                setIsChangingPassword(false);
                setCurrentPassword("");
                setNewPassword("");
                setConfirmPassword("");
              }}
            >
              Hủy
            </Button>
            <Button
              className="btn-primary"
              onClick={async () => {
                if (!currentPassword) {
                  showAlert("Vui lòng nhập mật khẩu hiện tại!", "error");
                  return;
                }
                if (newPassword.trim().length < 6) {
                  showAlert("Mật khẩu mới phải từ 6 ký tự trở lên!", "error");
                  return;
                }
                if (newPassword !== confirmPassword) {
                  showAlert("Mật khẩu nhập lại không khớp!", "error");
                  return;
                }
                if (!await saveChanges({ password: newPassword, currentPassword })) return;
                setIsChangingPassword(false);
                setCurrentPassword("");
                setNewPassword("");
                setConfirmPassword("");
                showAlert("Đã đổi mật khẩu thành công!", "success");
              }}
            >
              Lưu thay đổi
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal Xác thực danh tính */}
      <Modal
        isOpen={isVerificationModalOpen}
        onClose={() => setIsVerificationModalOpen(false)}
        title="Xác thực danh tính"
      >
          <div className="p-3">
            {verificationStep === 1 && (
              <div>
                <h6 className="mb-3">Bước 1: Giấy tờ tùy thân</h6>
                <p className="text-muted small mb-3">Vui lòng tải lên một trong các giấy tờ sau: CCCD, CMND, Giấy phép lái xe hoặc Hộ chiếu.</p>
                
                  <input type="file" className="form-control mb-2" accept="image/*" onChange={handleIdCardUpload} />
                  {idCardImage && (
                    <div className="mb-4 text-center">
                      <img src={idCardImage} alt="ID Card Preview" className="img-fluid rounded border border-secondary" style={{ maxHeight: '150px' }} />
                    </div>
                  )}

                <div className="d-flex justify-content-end gap-2">
                  <Button className="btn-secondary" onClick={() => setIsVerificationModalOpen(false)}>Hủy</Button>
                  <Button className="btn-primary" disabled={isScanningId || !idCardImage} onClick={() => {
                    setIsScanningId(true);
                    setTimeout(() => {
                      setIsScanningId(false);
                      setVerificationStep(2);
                    }, 2000);
                  }}>
                    {isScanningId ? "Đang quét AI..." : "Tiếp tục"}
                  </Button>
                </div>
              </div>
            )}
            {verificationStep === 2 && (
              <div>
                <h6 className="mb-3">Bước 2: Xác thực khuôn mặt</h6>
                <p className="text-muted small mb-3">Vui lòng đưa khuôn mặt của bạn vào khung hình để đối chiếu với giấy tờ.</p>
                
                <div className="camera-container mb-4 text-center position-relative bg-dark rounded overflow-hidden" style={{ height: "250px" }}>
                                      {!recordedVideo ? (
                      <>
                        <video ref={videoRef} autoPlay playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)" }}></video>
                        
                        {isRecording && (
                          <div className="position-absolute top-0 w-100 p-2 bg-dark bg-opacity-75 text-warning fw-bold animate-pulse">
                            <i className="bi bi-record-circle-fill text-danger me-2"></i> {livenessInstruction}
                          </div>
                        )}
                        
                        {!isRecording && (
                          <Button className="btn-primary position-absolute bottom-0 start-50 translate-middle-x mb-3 rounded-pill px-4 shadow" onClick={startRecording}>
                            <i className="bi bi-camera-video-fill me-2"></i> Bắt đầu quay Video
                          </Button>
                        )}
                      </>
                    ) : (
                      <>
                        <video src={recordedVideo} autoPlay loop playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)" }}></video>
                        <Button className="btn-secondary position-absolute bottom-0 start-50 translate-middle-x mb-3 rounded-pill px-4" onClick={retakeVideo}>
                          <i className="bi bi-arrow-counterclockwise me-2"></i> Quay lại
                        </Button>
                      </>
                    )}
                  <canvas ref={canvasRef} style={{ display: "none" }}></canvas>
                </div>

                <div className="d-flex justify-content-end gap-2">
                  <Button className="btn-secondary" onClick={() => setVerificationStep(1)}>Quay lại</Button>
                  <Button className="btn-primary" disabled={!recordedVideo} onClick={() => {
                    setVerificationStep(3);
                  }}>Xác nhận</Button>
                </div>
              </div>
            )}
            {verificationStep === 3 && (
              <div className="text-center py-4">
                <i className="bi bi-check-circle text-success" style={{ fontSize: "3rem" }}></i>
                <h6 className="mt-3">Đã gửi yêu cầu thành công!</h6>
                <p className="text-muted small mb-4">Chúng tôi sẽ xem xét giấy tờ của bạn trong vòng 3-7 ngày làm việc.</p>
                <Button className="btn-primary px-4" onClick={async () => {
                  setIsVerificationModalOpen(false);
                  setIsVerificationPending(true);
                  if (user) {
                    try {
                      const apiClient = (await import('../services/apiClient')).default;
                      await apiClient.post(`/users/${user.id}/verification`, {
                        id_card_image: idCardImage, // Real app would use actual file upload base64
                        selfie_image: recordedVideo
                      });
                    } catch (e: any) {
                      console.error('Failed to submit verification', e); alert('Lỗi gửi xác thực: ' + (e.response?.data?.error || e.message || e)); setIsVerificationPending(false);
                    }
                  }
                }}>Đóng</Button>
              </div>
            )}
        </div>
      </Modal>
    </div>
  );
};

export default SettingsView;




