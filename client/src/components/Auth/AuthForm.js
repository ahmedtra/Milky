import React from 'react';
import styled from 'styled-components';
import { motion } from 'framer-motion';

const FormContainer = styled.div`
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 2rem;
`;

const FormCard = styled(motion.div)`
  background: white;
  padding: 3rem;
  border-radius: ${props => props.theme.borderRadius.xl};
  box-shadow: ${props => props.theme.shadows.xl};
  width: 100%;
  max-width: 400px;
`;

const Logo = styled.div`
  text-align: center;
  margin-bottom: 2rem;
  
  h1 {
    font-size: 2rem;
    font-weight: 700;
    color: ${props => props.theme.colors.primary[600]};
    margin-bottom: 0.5rem;
  }
  
  p {
    color: ${props => props.theme.colors.gray[600]};
    font-size: 0.9rem;
  }
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
`;

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

const Label = styled.label`
  font-weight: 500;
  color: ${props => props.theme.colors.gray[700]};
  font-size: 0.9rem;
`;

const Input = styled.input`
  padding: 0.75rem;
  border: 2px solid ${props => props.theme.colors.gray[200]};
  border-radius: ${props => props.theme.borderRadius.md};
  font-size: 1rem;
  transition: all 0.2s ease;
  
  &:focus {
    border-color: ${props => props.theme.colors.primary[500]};
    box-shadow: 0 0 0 3px ${props => props.theme.colors.primary[100]};
  }
  
  &::placeholder {
    color: ${props => props.theme.colors.gray[400]};
  }
`;

const Button = styled.button`
  background: ${props => props.theme.colors.primary[600]};
  color: white;
  padding: 0.875rem;
  border-radius: ${props => props.theme.borderRadius.md};
  font-weight: 600;
  font-size: 1rem;
  transition: all 0.2s ease;
  
  &:hover:not(:disabled) {
    background: ${props => props.theme.colors.primary[700]};
    transform: translateY(-1px);
  }
  
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const LinkText = styled.div`
  text-align: center;
  margin-top: 1.5rem;
  color: ${props => props.theme.colors.gray[600]};
  
  a {
    color: ${props => props.theme.colors.primary[600]};
    font-weight: 500;
    text-decoration: underline;
    
    &:hover {
      color: ${props => props.theme.colors.primary[700]};
    }
  }
`;

const ErrorMessage = styled.div`
  background: ${props => props.theme.colors.error[50]};
  color: ${props => props.theme.colors.error[700]};
  padding: 0.75rem;
  border-radius: ${props => props.theme.borderRadius.md};
  border: 1px solid ${props => props.theme.colors.error[200]};
  font-size: 0.9rem;
`;

const AuthForm = ({ 
  title, 
  subtitle, 
  onSubmit, 
  loading, 
  error, 
  linkText, 
  linkPath, 
  children 
}) => {
  return (
    <FormContainer>
      <FormCard
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <Logo>
          <h1>Milky</h1>
          <p>AI Diet Assistant</p>
        </Logo>
        
        <Form onSubmit={onSubmit}>
          {error && <ErrorMessage>{error}</ErrorMessage>}
          {children}
          <Button type="submit" disabled={loading}>
            {loading ? 'Loading...' : title}
          </Button>
        </Form>
        
        {linkText && linkPath && (
          <LinkText>
            <a href={linkPath}>{linkText}</a>
          </LinkText>
        )}
      </FormCard>
    </FormContainer>
  );
};

export { FormGroup, Label, Input };
export default AuthForm;




