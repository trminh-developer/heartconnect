import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ConversationList, ChatHeader, MessageList, MessageInput } from '../components/messaging';
import { useCall } from '../hooks/useCall';
import { EmptyState, Loading } from '../components/common';
import { useChat } from '../hooks/useChat';
import { useAuth } from '../hooks/useAuth';

const MessagesView = () => {
  const { t } = useTranslation();
  const { conversations, activeConversation, messages, isLoading, selectConversation, sendMessage, loadConversations } = useChat();
  const { user } = useAuth();
  const [showList, setShowList] = useState(true);
  
  const calling = useCall();

  React.useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  const handleSelectConversation = (conversation: any) => {
    selectConversation(conversation.id);
    if (window.innerWidth < 992) {
      setShowList(false);
    }
  };

  React.useEffect(() => {
    let interval: any;
    if (activeConversation) {
      interval = setInterval(() => {
        selectConversation(activeConversation.id);
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [activeConversation, selectConversation]);

  if (isLoading && conversations.length === 0) return <Loading text={t('messages.loading')} />;

  const activePartner = activeConversation?.participants?.find((p: any) => p.id !== user?.id) || activeConversation?.participants?.[0];

  return (
    <div className="messages-layout h-100 fade-in hc-card overflow-hidden">
      <div className="d-flex h-100 w-100">
        <div className={`messages-sidebar border-end h-100 d-flex flex-column ${!showList ? 'd-none d-lg-flex' : ''}`}>
          {conversations && conversations.length > 0 ? (
            <ConversationList 
              conversations={conversations} 
              activeId={activeConversation?.id} 
              onSelect={handleSelectConversation}
              currentUserId={user?.id || ''} 
            />
          ) : (
            <div className="flex-grow-1 d-flex justify-content-center align-items-center">
              <EmptyState 
                icon="chat-square-text" 
                title={t('messages.empty_title')} 
                description={t('messages.empty_desc')} 
              />
            </div>
          )}
        </div>

        <div className={`h-100 d-flex flex-column flex-grow-1 ${showList ? 'd-none d-lg-flex' : ''}`}>
          {activeConversation && activePartner ? (
            <>
              <ChatHeader 
                user={activePartner} 
                onBack={() => setShowList(true)}
                onCall={() => void calling.start(activeConversation.id, 'audio')}
                onVideoCall={() => void calling.start(activeConversation.id, 'video')}
                callDisabled={calling.busy}
              />
              {calling.error && <p className="call-error px-3" role="alert">{t(calling.error)}</p>}
              <MessageList messages={messages} currentUserId={user?.id || ''} />
              <MessageInput onSend={(content) => {
                if (content.startsWith('[IMAGE]')) {
                  sendMessage(activeConversation.id, content.substring(7), 'image' as any);
                } else {
                  sendMessage(activeConversation.id, content);
                }
              }} />
            </>
          ) : (
            <div className="flex-grow-1 d-flex align-items-center justify-content-center">
              <EmptyState icon="bi bi-chat-dots" title={t('messages.select_prompt')} description="" />
            </div>
          )}
        </div>
      </div>
      
    </div>
  );
};

export default MessagesView;
