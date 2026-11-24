import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Story } from '../../models';

interface StoryViewerProps {
  stories: Story[];
  onClose: () => void;
  onComplete?: () => void; // Gọi khi xem hết story của user này
}

export const StoryViewer: React.FC<StoryViewerProps> = ({ stories, onClose, onComplete }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const currentStory = stories[currentIndex];
  const videoRef = useRef<HTMLVideoElement>(null);
  
  const STORY_DURATION = 5000; // 5 seconds for text/image

  const goToNext = useCallback(() => {
    if (currentIndex < stories.length - 1) setCurrentIndex(prev => prev + 1);
    else (onComplete || onClose)();
  }, [currentIndex, stories.length, onComplete, onClose]);

  useEffect(() => {
    if (!currentStory) (onComplete || onClose)();
  }, [currentStory, onComplete, onClose]);

  useEffect(() => {
    if (!currentStory) return;
    setProgress(0);
    
    let animationFrameId: number;
    const startTime = Date.now();
    const duration = STORY_DURATION;

    const animate = () => {
      if (!currentStory) return;

      // Nếu là video, progress phụ thuộc vào currentTime của video
      if (currentStory.mediaType === 'video' && videoRef.current) {
        if (videoRef.current.duration) {
          const currentProgress = (videoRef.current.currentTime / videoRef.current.duration) * 100;
          setProgress(currentProgress);
        }
        animationFrameId = requestAnimationFrame(animate);
        return;
      }

      // Với text và image, progress phụ thuộc vào thời gian
      const elapsed = Date.now() - startTime;
      const currentProgress = Math.min((elapsed / duration) * 100, 100);
      setProgress(currentProgress);

      if (currentProgress < 100) {
        animationFrameId = requestAnimationFrame(animate);
      } else {
        goToNext();
      }
    };

    animationFrameId = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(animationFrameId);
  }, [currentIndex, currentStory, goToNext]);

  const goToPrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    }
  };

  const handleVideoEnded = () => {
    goToNext();
  };

  if (!currentStory) return null;

  return (
    <div className="position-fixed top-0 start-0 w-100 h-100 bg-black z-3 d-flex flex-column justify-content-center align-items-center" style={{ zIndex: 1050 }}>
      {/* Progress Bars */}
      <div className="position-absolute top-0 start-0 w-100 p-3 d-flex gap-1" style={{ zIndex: 1051 }}>
        {stories.map((story, idx) => (
          <div key={story.id} className="flex-grow-1 bg-secondary rounded" style={{ height: '4px', overflow: 'hidden' }}>
            <div 
              className="bg-white h-100" 
              style={{ 
                width: idx === currentIndex ? `${progress}%` : (idx < currentIndex ? '100%' : '0%'),
                transition: currentStory.mediaType !== 'video' ? 'width 0.1s linear' : 'none'
              }}
            />
          </div>
        ))}
      </div>

      {/* Header Info */}
      <div className="position-absolute top-0 start-0 w-100 p-3 mt-3 d-flex align-items-center justify-content-between text-white" style={{ zIndex: 1051 }}>
        <div className="d-flex align-items-center gap-2">
          <img src={currentStory.user?.avatar || '/default-avatar.png'} alt="Avatar" className="rounded-circle object-fit-cover" style={{ width: '40px', height: '40px' }} />
          <span className="fw-bold">{currentStory.user?.firstName} {currentStory.user?.lastName}</span>
        </div>
        <button className="btn btn-link text-white fs-3 p-0" onClick={onClose}><i className="bi bi-x-lg"></i></button>
      </div>

      {/* Navigation Click Areas */}
      <div className="position-absolute top-0 start-0 w-25 h-100" style={{ zIndex: 1050, cursor: 'pointer' }} onClick={goToPrev} />
      <div className="position-absolute top-0 end-0 w-25 h-100" style={{ zIndex: 1050, cursor: 'pointer' }} onClick={goToNext} />

      {/* Content */}
      <div className="story-content w-100 h-100 d-flex justify-content-center align-items-center" style={{ backgroundColor: currentStory.mediaType === 'text' ? currentStory.backgroundColor : '#000' }}>
        {currentStory.mediaType === 'text' && (
          <h2 className="text-white text-center fw-bold p-4 w-75" style={{ wordWrap: 'break-word' }}>
            {currentStory.textContent}
          </h2>
        )}
        
        {currentStory.mediaType === 'image' && currentStory.mediaUrl && (
          <img src={currentStory.mediaUrl} alt="Story" className="w-100 h-100 object-fit-contain" />
        )}
        
        {currentStory.mediaType === 'video' && currentStory.mediaUrl && (
          <video 
            ref={videoRef}
            src={currentStory.mediaUrl} 
            className="w-100 h-100 object-fit-contain" 
            autoPlay 
            playsInline 
            onEnded={handleVideoEnded}
          />
        )}
      </div>
    </div>
  );
};
