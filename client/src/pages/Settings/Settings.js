import React from 'react';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import { Bot, Link as LinkIcon } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';

const PageContainer = styled.div`
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 2rem;

  @media (max-width: 1024px) {
    grid-template-columns: 1fr;
  }
`;

const Card = styled(motion.div)`
  background: white;
  border-radius: ${props => props.theme.borderRadius.lg};
  box-shadow: ${props => props.theme.shadows.md};
  border: 1px solid ${props => props.theme.colors.gray[200]};
  overflow: hidden;
`;

const CardHeader = styled.div`
  padding: 1.5rem;
  border-bottom: 1px solid ${props => props.theme.colors.gray[200]};
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
`;

const CardTitle = styled.h2`
  font-size: 1.5rem;
  font-weight: 700;
  color: ${props => props.theme.colors.gray[800]};
  margin: 0;
  display: flex;
  align-items: center;
  gap: 0.75rem;
`;

const CardContent = styled.div`
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
`;

const StepsList = styled.ol`
  display: flex;
  flex-direction: column;
  gap: 1rem;
  counter-reset: steps;

  li {
    position: relative;
    padding-left: 2rem;
    color: ${props => props.theme.colors.gray[600]};
    line-height: 1.6;
  }

  li::before {
    counter-increment: steps;
    content: counter(steps);
    position: absolute;
    left: 0;
    top: 0.2rem;
    width: 1.5rem;
    height: 1.5rem;
    border-radius: 50%;
    background: ${props => props.theme.colors.primary[100]};
    color: ${props => props.theme.colors.primary[700]};
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
  }
`;

const InstructionCard = styled.div`
  background: ${props => props.theme.colors.gray[50]};
  border: 1px solid ${props => props.theme.colors.gray[200]};
  border-radius: ${props => props.theme.borderRadius.md};
  padding: 1.25rem;
  color: ${props => props.theme.colors.gray[600]};
  line-height: 1.6;

  code {
    background: ${props => props.theme.colors.gray[100]};
    padding: 0.15rem 0.35rem;
    border-radius: ${props => props.theme.borderRadius.sm};
    font-family: 'Source Code Pro', monospace;
  }
`;

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

const Label = styled.label`
  font-weight: 600;
  color: ${props => props.theme.colors.gray[700]};
`;

const Input = styled.input`
  padding: 0.75rem 1rem;
  border: 1px solid ${props => props.theme.colors.gray[300]};
  border-radius: ${props => props.theme.borderRadius.md};
  font-size: 1rem;
  transition: border-color 0.2s ease;

  &:focus {
    outline: none;
    border-color: ${props => props.theme.colors.primary[500]};
    box-shadow: 0 0 0 3px ${props => props.theme.colors.primary[100]};
  }
`;

const ButtonRow = styled.div`
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
`;

const Button = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.75rem 1.5rem;
  border-radius: ${props => props.theme.borderRadius.md};
  border: none;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  background: ${props => props.$variant === 'secondary' 
    ? props.theme.colors.gray[100]
    : props.theme.colors.primary[600]};
  color: ${props => props.$variant === 'secondary'
    ? props.theme.colors.gray[700]
    : 'white'};

  &:hover {
    transform: translateY(-1px);
    box-shadow: ${props => props.theme.shadows.md};
    background: ${props => props.$variant === 'secondary'
      ? props.theme.colors.gray[200]
      : props.theme.colors.primary[700]};
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
  }
`;

const StatusBadge = styled.span`
  padding: 0.35rem 0.75rem;
  border-radius: ${props => props.theme.borderRadius.full};
  font-size: 0.8rem;
  font-weight: 600;
  background: ${props => props.$connected ? props.theme.colors.success[100] : props.theme.colors.warning[100]};
  color: ${props => props.$connected ? props.theme.colors.success[700] : props.theme.colors.warning[700]};
`;

const Settings = () => {
  const { user, refreshUser } = useAuth();
  const [telegramChatId, setTelegramChatId] = React.useState(user?.telegramChatId || '');
  const [telegramUsername, setTelegramUsername] = React.useState(user?.telegramUsername || '');
  const [newChatId, setNewChatId] = React.useState('');
  const [newUsername, setNewUsername] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    setTelegramChatId(user?.telegramChatId || '');
    setTelegramUsername(user?.telegramUsername || '');
  }, [user?.telegramChatId, user?.telegramUsername]);

  const handleSaveTelegram = async () => {
    if (!newChatId.trim()) {
      toast.error('Please enter your Telegram chat ID');
      return;
    }

    setSaving(true);
    try {
      await axios.post('/api/users/link-telegram', {
        telegramChatId: newChatId.trim(),
        telegramUsername: newUsername.trim() || undefined
      });

      toast.success('Telegram account linked successfully');
      setTelegramChatId(newChatId.trim());
      setTelegramUsername(newUsername.trim());
      setNewChatId('');
      setNewUsername('');
      refreshUser?.();
    } catch (error) {
      console.error('Error linking Telegram:', error);
      toast.error(error.response?.data?.message || 'Failed to link Telegram account');
    } finally {
      setSaving(false);
    }
  };

  const handleUnlinkTelegram = async () => {
    setSaving(true);
    try {
      await axios.post('/api/users/unlink-telegram');
      toast.success('Telegram account unlinked');
      setTelegramChatId('');
      setTelegramUsername('');
      refreshUser?.();
    } catch (error) {
      console.error('Error unlinking Telegram:', error);
      toast.error(error.response?.data?.message || 'Failed to unlink Telegram account');
    } finally {
      setSaving(false);
    }
  };


  return (
    <PageContainer>
      <Card
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <CardHeader>
          <CardTitle>
            <Bot size={24} />
            Telegram Integration
          </CardTitle>
          <StatusBadge $connected={Boolean(telegramChatId)}>
            {telegramChatId ? 'Connected' : 'Not Connected'}
          </StatusBadge>
        </CardHeader>
        <CardContent>
          <InstructionCard>
            <strong>How to link your Telegram account:</strong>
            <StepsList>
              <li>Open Telegram and search for <code>@MilkyDietAssistantBot</code>.</li>
              <li>Press <code>/start</code> to initialize the bot and follow the steps.</li>
              <li>Use the <code>/link &lt;your_username&gt;</code> command or copy the chat ID the bot provides.</li>
              <li>Enter your chat ID (and optional username) below to finish linking.</li>
            </StepsList>
          </InstructionCard>

          <FormGroup>
            <Label htmlFor="telegram-chat-id">Telegram Chat ID</Label>
            <Input
              id="telegram-chat-id"
              placeholder={telegramChatId || 'Enter your Telegram chat ID'}
              value={newChatId}
              onChange={(event) => setNewChatId(event.target.value)}
            />
          </FormGroup>

          <FormGroup>
            <Label htmlFor="telegram-username">Telegram Username (optional)</Label>
            <Input
              id="telegram-username"
              placeholder={telegramUsername || 'Your Telegram username'}
              value={newUsername}
              onChange={(event) => setNewUsername(event.target.value)}
            />
          </FormGroup>

          <ButtonRow>
            <Button onClick={handleSaveTelegram} disabled={saving}>
              <LinkIcon size={18} />
              {telegramChatId ? 'Update Telegram Link' : 'Link Telegram'}
            </Button>
            {telegramChatId && (
              <Button
                $variant="secondary"
                onClick={handleUnlinkTelegram}
                disabled={saving}
              >
                Unlink Telegram
              </Button>
            )}
          </ButtonRow>

          {telegramChatId && (
            <InstructionCard style={{ marginTop: '0.5rem' }}>
              <strong>Current connection:</strong>
              <div>Chat ID: {telegramChatId}</div>
              {telegramUsername && <div>Username: @{telegramUsername}</div>}
            </InstructionCard>
          )}
        </CardContent>
      </Card>

      <Card
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.3 }}
      >
        <CardHeader>
          <CardTitle>
            <LinkIcon size={24} />
            Integration Checklist
          </CardTitle>
        </CardHeader>
        <CardContent>
          <InstructionCard>
            <strong>Before you start:</strong>
            <StepsList>
              <li>Set the <code>TELEGRAM_BOT_TOKEN</code> in your server environment (.env) and restart the backend.</li>
              <li>Ensure the Telegram bot is running and reachable.</li>
              <li>Link your Telegram account here to receive reminders and notifications.</li>
              <li>If notifications stop, unlink and relink to refresh the connection.</li>
            </StepsList>
          </InstructionCard>
        </CardContent>
      </Card>
    </PageContainer>
  );
};

export default Settings;



