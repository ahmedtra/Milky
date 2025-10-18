import React from 'react';
import { NavLink } from 'react-router-dom';
import styled from 'styled-components';
import { 
  Home, 
  MessageCircle, 
  Calendar, 
  ShoppingCart, 
  Settings, 
  ChevronLeft,
  ChevronRight,
  BarChart3
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useAuth } from '../../contexts/AuthContext';

const SidebarContainer = styled(motion.aside)`
  position: fixed;
  top: 0;
  left: 0;
  height: 100vh;
  width: ${props => props.$isOpen ? '280px' : '80px'};
  background: white;
  border-right: 1px solid ${props => props.theme.colors.gray[200]};
  z-index: 1000;
  transition: width 0.3s ease, transform 0.3s ease;
  overflow: hidden;
  box-shadow: ${props => props.theme.shadows.md};

  @media (max-width: 768px) {
    width: 100%;
    height: auto;
    max-height: 90vh;
    transform: translateY(${props => props.$isOpen ? '0' : '-100%'});
    border-right: none;
    border-bottom: 1px solid ${props => props.theme.colors.gray[200]};
    box-shadow: ${props => props.theme.shadows.lg};
    overflow-y: auto;
    pointer-events: ${props => props.$isOpen ? 'auto' : 'none'};
  }
`;

const SidebarHeader = styled.div`
  padding: 1.5rem 1rem;
  border-bottom: 1px solid ${props => props.theme.colors.gray[200]};
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const Logo = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  opacity: ${props => props.$isOpen ? 1 : 0};
  transition: opacity 0.3s ease;
  white-space: nowrap;

  h2 {
    font-size: 1.25rem;
    font-weight: 700;
    color: ${props => props.theme.colors.gray[800]};
    margin: 0;
  }

  span {
    font-size: 0.75rem;
    color: ${props => props.theme.colors.gray[500]};
    background: ${props => props.theme.colors.primary[100]};
    padding: 0.125rem 0.5rem;
    border-radius: ${props => props.theme.borderRadius.full};
  }
`;

const ToggleButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: ${props => props.theme.borderRadius.md};
  background: ${props => props.theme.colors.gray[100]};
  color: ${props => props.theme.colors.gray[600]};
  transition: all 0.2s ease;

  &:hover {
    background: ${props => props.theme.colors.gray[200]};
  }

  @media (max-width: 768px) {
    position: relative;
  }
`;

const Navigation = styled.nav`
  padding: 1rem 0;
  flex: 1;
`;

const NavItem = styled(NavLink)`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  margin: 0.25rem 1rem;
  border-radius: ${props => props.theme.borderRadius.md};
  color: ${props => props.theme.colors.gray[600]};
  text-decoration: none;
  transition: all 0.2s ease;
  position: relative;

  &:hover {
    background: ${props => props.theme.colors.gray[50]};
    color: ${props => props.theme.colors.gray[700]};
  }

  &.active {
    background: ${props => props.theme.colors.primary[50]};
    color: ${props => props.theme.colors.primary[700]};
    font-weight: 500;

    &::before {
      content: '';
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 3px;
      background: ${props => props.theme.colors.primary[600]};
      border-radius: 0 2px 2px 0;
    }
  }
`;

const NavIcon = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
`;

const NavLabel = styled.span`
  opacity: ${props => props.$isOpen ? 1 : 0};
  transition: opacity 0.3s ease;
  white-space: nowrap;
  overflow: hidden;
`;

const SidebarFooter = styled.div`
  padding: 1rem;
  border-top: 1px solid ${props => props.theme.colors.gray[200]};
  margin-top: auto;
`;

const UserInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  border-radius: ${props => props.theme.borderRadius.md};
  background: ${props => props.theme.colors.gray[50]};
  opacity: ${props => props.$isOpen ? 1 : 0};
  transition: opacity 0.3s ease;
`;

const UserAvatar = styled.div`
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: ${props => props.theme.colors.primary[600]};
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: 600;
  font-size: 0.9rem;
  flex-shrink: 0;
`;

const UserDetails = styled.div`
  min-width: 0;
`;

const UserName = styled.div`
  font-weight: 500;
  font-size: 0.9rem;
  color: ${props => props.theme.colors.gray[800]};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const UserEmail = styled.div`
  font-size: 0.75rem;
  color: ${props => props.theme.colors.gray[500]};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const menuItems = [
  { path: '/dashboard', icon: Home, label: 'Dashboard' },
  { path: '/chat', icon: MessageCircle, label: 'AI Chat' },
  { path: '/meal-plans', icon: Calendar, label: 'Meal Plans' },
  { path: '/shopping-lists', icon: ShoppingCart, label: 'Shopping Lists' },
  { path: '/stats', icon: BarChart3, label: 'Statistics' },
  { path: '/settings', icon: Settings, label: 'Settings' },
];

const Sidebar = ({ isOpen, onToggle, isMobile }) => {
  const { user } = useAuth();
  // const location = useLocation(); // Removed unused variable

  return (
    <SidebarContainer
      $isOpen={isOpen}
      initial={false}
      animate={isMobile ? { height: 'auto' } : { width: isOpen ? 280 : 80 }}
      transition={{ duration: 0.3 }}
    >
      <SidebarHeader>
        <Logo $isOpen={isOpen}>
          <h2>Milky</h2>
          <span>AI</span>
        </Logo>
        <ToggleButton onClick={onToggle}>
          {isOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
        </ToggleButton>
      </SidebarHeader>

      <Navigation>
        {menuItems.map((item) => (
          <NavItem
            key={item.path}
            to={item.path}
            className={({ isActive }) => isActive ? 'active' : ''}
            onClick={() => {
              if (isMobile && isOpen) {
                onToggle();
              }
            }}
          >
            <NavIcon>
              <item.icon size={20} />
            </NavIcon>
            <NavLabel $isOpen={isOpen}>{item.label}</NavLabel>
          </NavItem>
        ))}
      </Navigation>

      <SidebarFooter>
        <UserInfo $isOpen={isOpen}>
          <UserAvatar>
            {user?.username?.charAt(0).toUpperCase()}
          </UserAvatar>
          <UserDetails>
            <UserName>{user?.username}</UserName>
            <UserEmail>{user?.email}</UserEmail>
          </UserDetails>
        </UserInfo>
      </SidebarFooter>
    </SidebarContainer>
  );
};

export default Sidebar;
