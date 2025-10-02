import React from 'react';
import styled from 'styled-components';

const Container = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  height: 400px;
  background: white;
  border-radius: ${props => props.theme.borderRadius.lg};
  box-shadow: ${props => props.theme.shadows.lg};
`;

const PlaceholderText = styled.h2`
  color: ${props => props.theme.colors.gray[600]};
  font-size: 1.5rem;
  font-weight: 500;
`;

const Profile = () => {
  return (
    <Container>
      <PlaceholderText>Profile Page - Coming Soon!</PlaceholderText>
    </Container>
  );
};

export default Profile;


