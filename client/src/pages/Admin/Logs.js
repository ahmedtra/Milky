import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import axios from 'axios';
import { ChevronDown, RefreshCw } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
`;

const Title = styled.h2`
  margin: 0;
`;

const Button = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.6rem 1rem;
  border-radius: 8px;
  background: ${props => props.theme.colors.primary[600]};
  color: white;
  border: none;
  &:hover {
    background: ${props => props.theme.colors.primary[700]};
  }
`;

const LogList = styled.div`
  border: 1px solid ${props => props.theme.colors.gray[200]};
  border-radius: 12px;
  background: white;
  overflow: hidden;
`;

const LogRow = styled.details`
  border-bottom: 1px solid ${props => props.theme.colors.gray[100]};
  padding: 0.75rem 1rem;
  background: ${props => props.$level === 'error' ? '#fef2f2' : 'white'};
  &[open] {
    background: ${props => props.$level === 'error' ? '#fee2e2' : props.theme.colors.gray[50]};
  }
  summary {
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    list-style: none;
  }
  summary::-webkit-details-marker {
    display: none;
  }
`;

const Meta = styled.pre`
  margin: 0.5rem 0 0 1.75rem;
  background: ${props => props.theme.colors.gray[50]};
  padding: 0.75rem;
  border-radius: 8px;
  font-size: 0.85rem;
  overflow: auto;
`;

const Badge = styled.span`
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  font-size: 0.75rem;
  background: ${props => {
    if (props.$level === 'error') return '#fecaca';
    if (props.$level === 'warn') return '#fef08a';
    return props.theme.colors.primary[100];
  }};
  color: ${props => props.theme.colors.gray[800]};
`;

const AdminLogs = () => {
  const { isAdmin } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/admin/logs?limit=200');
      setLogs(res.data.logs || []);
    } catch (err) {
      console.error('Failed to fetch logs', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) loadLogs();
  }, [isAdmin]);

  if (!isAdmin) {
    return <div>Admin access required.</div>;
  }

  return (
    <Wrapper>
      <Header>
        <Title>Admin Logs (last 7 days)</Title>
        <Button onClick={loadLogs} disabled={loading}>
          <RefreshCw size={16} />
          {loading ? 'Loading...' : 'Refresh'}
        </Button>
      </Header>
      <LogList>
        {logs.map((log) => (
          <LogRow key={log._id} $level={log.level}>
            <summary>
              <ChevronDown size={16} />
              <Badge $level={log.level}>{log.level}</Badge>
              <span>{new Date(log.createdAt).toLocaleString()}</span>
              {log.userId && <span>• user: {log.userId}</span>}
              <span>• {log.message}</span>
            </summary>
            <Meta>{JSON.stringify(log.meta || {}, null, 2)}</Meta>
          </LogRow>
        ))}
      </LogList>
    </Wrapper>
  );
};

export default AdminLogs;
