import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import { BarChart3, RefreshCw } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2rem;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
`;

const Title = styled.h1`
  font-size: 2rem;
  font-weight: 700;
  color: ${props => props.theme.colors.gray[800]};
  margin: 0;
  display: flex;
  align-items: center;
  gap: 0.75rem;
`;

const RefreshButton = styled(motion.button)`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.25rem;
  background: ${props => props.theme.colors.primary[600]};
  color: white;
  border: none;
  border-radius: ${props => props.theme.borderRadius.md};
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover:not(:disabled) {
    background: ${props => props.theme.colors.primary[700]};
    transform: translateY(-2px);
    box-shadow: ${props => props.theme.shadows.md};
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .spinning {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
`;

const ChartsGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: 2rem;
`;

const ChartCard = styled(motion.div)`
  background: white;
  border-radius: ${props => props.theme.borderRadius.lg};
  box-shadow: ${props => props.theme.shadows.md};
  border: 1px solid ${props => props.theme.colors.gray[200]};
  padding: 2rem;
`;

const ChartTitle = styled.h3`
  font-size: 1.25rem;
  font-weight: 600;
  color: ${props => props.theme.colors.gray[800]};
  margin: 0 0 1.5rem 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const ChartColorDot = styled.span`
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: ${props => props.$color};
`;

const LoadingContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 400px;
  color: ${props => props.theme.colors.gray[500]};
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 3rem 2rem;
  background: white;
  border-radius: ${props => props.theme.borderRadius.lg};
  box-shadow: ${props => props.theme.shadows.md};
  border: 1px solid ${props => props.theme.colors.gray[200]};
`;

const EmptyIcon = styled.div`
  width: 64px;
  height: 64px;
  margin: 0 auto 1rem;
  background: ${props => props.theme.colors.gray[100]};
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${props => props.theme.colors.gray[400]};
`;

const EmptyTitle = styled.h3`
  font-size: 1.25rem;
  font-weight: 600;
  color: ${props => props.theme.colors.gray[700]};
  margin: 0 0 0.5rem 0;
`;

const EmptyDescription = styled.p`
  margin: 0;
  color: ${props => props.theme.colors.gray[500]};
  line-height: 1.6;
`;

const LineChart = ({ data, dataKey, color, label }) => {
  if (!data || data.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>
        No data available
      </div>
    );
  }

  const width = 800;
  const height = 250;
  const padding = { top: 20, right: 30, bottom: 60, left: 60 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const values = data.map(d => d[dataKey]);
  const maxValue = Math.max(...values, 1);
  const minValue = Math.min(...values, 0);
  const valueRange = maxValue - minValue || 1;

  const points = data.map((d, i) => {
    const x = padding.left + (i / Math.max(data.length - 1, 1)) * chartWidth;
    const y = padding.top + chartHeight - ((d[dataKey] - minValue) / valueRange) * chartHeight;
    return { x, y, value: d[dataKey], date: d.date };
  });

  const pathD = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
    .join(' ');

  const areaD = `${pathD} L ${points[points.length - 1].x} ${height - padding.bottom} L ${padding.left} ${height - padding.bottom} Z`;

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <svg width={width} height={height} style={{ maxWidth: '100%', height: 'auto' }}>
        {/* Grid lines */}
        {[0, 1, 2, 3, 4].map(i => {
          const y = padding.top + (chartHeight / 4) * i;
          const value = Math.round(maxValue - (valueRange / 4) * i);
          return (
            <g key={i}>
              <line
                x1={padding.left}
                y1={y}
                x2={width - padding.right}
                y2={y}
                stroke="#e5e7eb"
                strokeWidth="1"
              />
              <text
                x={padding.left - 10}
                y={y + 4}
                textAnchor="end"
                fontSize="12"
                fill="#64748b"
              >
                {value}
              </text>
            </g>
          );
        })}

        {/* Area fill */}
        <path
          d={areaD}
          fill={color}
          fillOpacity="0.1"
        />

        {/* Line */}
        <path
          d={pathD}
          stroke={color}
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Points */}
        {points.map((p, i) => (
          <g key={i}>
            <circle
              cx={p.x}
              cy={p.y}
              r="5"
              fill={color}
              stroke="white"
              strokeWidth="2"
            />
            <title>{`${new Date(p.date).toLocaleDateString()}: ${Math.round(p.value)} ${label}`}</title>
          </g>
        ))}

        {/* X-axis labels */}
        {points.map((p, i) => (
          <text
            key={i}
            x={p.x}
            y={height - padding.bottom + 20}
            textAnchor="middle"
            fontSize="11"
            fill="#64748b"
            transform={`rotate(-45 ${p.x} ${height - padding.bottom + 20})`}
          >
            {new Date(p.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </text>
        ))}

        {/* Y-axis label */}
        <text
          x={20}
          y={height / 2}
          textAnchor="middle"
          fontSize="12"
          fill="#64748b"
          transform={`rotate(-90 20 ${height / 2})`}
        >
          {label}
        </text>
      </svg>
    </div>
  );
};

const Stats = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      console.log('📊 Fetching stats from backend...');
      const response = await axios.get('/api/meal-plans/stats');
      console.log('📊 Stats response:', response.data);
      setStats(response.data);
      if (response.data.consumedMealsCount > 0) {
        toast.success('Statistics updated!');
      }
    } catch (error) {
      console.error('❌ Error fetching stats:', error);
      toast.error('Failed to load statistics');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setLoading(true);
    await fetchStats();
  };

  if (loading) {
    return (
      <Container>
        <Header>
          <Title>
            <BarChart3 size={32} />
            Nutrition Statistics
          </Title>
        </Header>
        <LoadingContainer>Loading statistics...</LoadingContainer>
      </Container>
    );
  }

  if (!stats || !stats.dailyNutrition || stats.dailyNutrition.length === 0) {
    return (
      <Container>
        <Header>
          <Title>
            <BarChart3 size={32} />
            Nutrition Statistics
          </Title>
          <RefreshButton
            onClick={handleRefresh}
            disabled={loading}
            whileHover={{ scale: loading ? 1 : 1.02 }}
            whileTap={{ scale: loading ? 1 : 0.98 }}
          >
            <RefreshCw size={18} className={loading ? 'spinning' : ''} />
            Refresh
          </RefreshButton>
        </Header>
        <EmptyState>
          <EmptyIcon>
            <BarChart3 size={32} />
          </EmptyIcon>
          <EmptyTitle>No Statistics Yet</EmptyTitle>
          <EmptyDescription>
            Mark some meals as completed in your meal plans to start tracking your nutrition statistics!
          </EmptyDescription>
        </EmptyState>
      </Container>
    );
  }

  const chartConfigs = [
    { dataKey: 'calories', color: '#ef4444', label: 'Calories (kcal)' },
    { dataKey: 'protein', color: '#3b82f6', label: 'Protein (g)' },
    { dataKey: 'carbs', color: '#f59e0b', label: 'Carbohydrates (g)' },
    { dataKey: 'fat', color: '#8b5cf6', label: 'Fat (g)' }
  ];

  return (
    <Container>
      <Header>
        <Title>
          <BarChart3 size={32} />
          Nutrition Statistics
        </Title>
        <RefreshButton
          onClick={handleRefresh}
          disabled={loading}
          whileHover={{ scale: loading ? 1 : 1.02 }}
          whileTap={{ scale: loading ? 1 : 0.98 }}
        >
          <RefreshCw size={18} className={loading ? 'spinning' : ''} />
          Refresh
        </RefreshButton>
      </Header>

      <ChartsGrid>
        {chartConfigs.map((config, index) => (
          <ChartCard
            key={config.dataKey}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <ChartTitle>
              <ChartColorDot $color={config.color} />
              {config.label}
            </ChartTitle>
            <LineChart
              data={stats.dailyNutrition}
              dataKey={config.dataKey}
              color={config.color}
              label={config.label}
            />
          </ChartCard>
        ))}
      </ChartsGrid>
    </Container>
  );
};

export default Stats;
