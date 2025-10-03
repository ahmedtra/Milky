import React, { useState } from 'react';
import styled from 'styled-components';
import { Menu, Bell, User, Settings, LogOut } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';

const NavbarContainer = styled.nav`
  background: white;
  border-bottom: 1px solid ${props => props.theme.colors.gray[200]};
  padding: 1rem 2rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  position: sticky;
  top: 0;
  z-index: 100;
  box-shadow: ${props => props.theme.shadows.sm};

  @media (max-width: 768px) {
    padding: 1rem;
  }
`;

const LeftSection = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
`;

const MenuButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: ${props => props.theme.borderRadius.md};
  background: ${props => props.theme.colors.gray[100]};
  color: ${props => props.theme.colors.gray[600]};
  transition: all 0.2s ease;

  &:hover {
    background: ${props => props.theme.colors.gray[200]};
  }

  @media (min-width: 769px) {
    display: none;
  }
`;

const Title = styled.h1`
  font-size: 1.5rem;
  font-weight: 700;
  color: ${props => props.theme.colors.gray[800]};
  margin: 0;
`;

const RightSection = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
`;

const NotificationButton = styled.button`
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: ${props => props.theme.borderRadius.md};
  background: ${props => props.theme.colors.gray[100]};
  color: ${props => props.theme.colors.gray[600]};
  transition: all 0.2s ease;

  &:hover {
    background: ${props => props.theme.colors.gray[200]};
  }
`;

const NotificationBadge = styled.div`
  position: absolute;
  top: -2px;
  right: -2px;
  width: 8px;
  height: 8px;
  background: ${props => props.theme.colors.error[500]};
  border-radius: 50%;
  border: 2px solid white;
`;

const UserMenu = styled.div`
  position: relative;
`;

const UserButton = styled.button`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border-radius: ${props => props.theme.borderRadius.md};
  background: ${props => props.theme.colors.primary[50]};
  color: ${props => props.theme.colors.primary[700]};
  border: 1px solid ${props => props.theme.colors.primary[200]};
  transition: all 0.2s ease;

  &:hover {
    background: ${props => props.theme.colors.primary[100]};
  }
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
`;

const UserName = styled.span`
  font-weight: 500;
  font-size: 0.9rem;

  @media (max-width: 768px) {
    display: none;
  }
`;

const DropdownMenu = styled(motion.div)`
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 0.5rem;
  background: white;
  border: 1px solid ${props => props.theme.colors.gray[200]};
  border-radius: ${props => props.theme.borderRadius.md};
  box-shadow: ${props => props.theme.shadows.lg};
  min-width: 200px;
  z-index: 1000;
`;

const DropdownItem = styled.button`
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  text-align: left;
  color: ${props => props.theme.colors.gray[700]};
  transition: all 0.2s ease;
  border: none;
  background: none;

  &:hover {
    background: ${props => props.theme.colors.gray[50]};
  }

  &:first-child {
    border-radius: ${props => props.theme.borderRadius.md} ${props => props.theme.borderRadius.md} 0 0;
  }

  &:last-child {
    border-radius: 0 0 ${props => props.theme.borderRadius.md} ${props => props.theme.borderRadius.md};
  }

  &:only-child {
    border-radius: ${props => props.theme.borderRadius.md};
  }
`;

const DropdownDivider = styled.div`
  height: 1px;
  background: ${props => props.theme.colors.gray[200]};
  margin: 0.25rem 0;
`;

const Navbar = ({ onMenuClick }) => {
  const { user, logout } = useAuth();
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    setUserMenuOpen(false);
  };

  return (
    <NavbarContainer>
      <LeftSection>
        <MenuButton onClick={onMenuClick}>
          <Menu size={20} />
        </MenuButton>
        <Title>Milky Diet Assistant</Title>
      </LeftSection>

      <RightSection>
        <NotificationButton>
          <Bell size={20} />
          <NotificationBadge />
        </NotificationButton>

        <UserMenu>
          <UserButton onClick={() => setUserMenuOpen(!userMenuOpen)}>
            <UserAvatar>
              {user?.username?.charAt(0).toUpperCase()}
            </UserAvatar>
            <UserName>{user?.username}</UserName>
          </UserButton>

          <AnimatePresence>
            {userMenuOpen && (
              <DropdownMenu
                initial={{ opacity: 0, y: -10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.95 }}
                transition={{ duration: 0.15 }}
              >
                <DropdownItem onClick={() => setUserMenuOpen(false)}>
                  <User size={16} />
                  Profile
                </DropdownItem>
                <DropdownItem onClick={() => setUserMenuOpen(false)}>
                  <Settings size={16} />
                  Settings
                </DropdownItem>
                <DropdownDivider />
                <DropdownItem onClick={handleLogout}>
                  <LogOut size={16} />
                  Sign Out
                </DropdownItem>
              </DropdownMenu>
            )}
          </AnimatePresence>
        </UserMenu>
      </RightSection>
    </NavbarContainer>
  );
};

export default Navbar;




