import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import styled, { ThemeProvider } from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
import { theme } from './styles/GlobalStyles';

// Components
import Navbar from './components/Layout/Navbar';
import Sidebar from './components/Layout/Sidebar';
import ProtectedRoute from './components/Auth/ProtectedRoute';

// Pages
import Login from './pages/Auth/Login';
import Register from './pages/Auth/Register';
import Dashboard from './pages/Dashboard/Dashboard';
import Chat from './pages/Chat/Chat';
import MealPlans from './pages/MealPlans/MealPlans';
import MealPlanDetail from './pages/MealPlans/MealPlanDetail';
import ShoppingLists from './pages/ShoppingLists/ShoppingLists';
import ShoppingListDetail from './pages/ShoppingLists/ShoppingListDetail';
import Settings from './pages/Settings/Settings';
import Profile from './pages/Profile/Profile';
import Stats from './pages/Stats/Stats';
import AdminLogs from './pages/Admin/Logs';

// Hooks
import { useAuth } from './contexts/AuthContext';

const AppContainer = styled.div`
  min-height: 100vh;
  background-color: ${props => props.theme.colors.gray[50]};
  width: 100%;
  overflow-x: hidden;
`;

const MainContent = styled.div`
  display: flex;
  min-height: 100vh;
`;

const ContentArea = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  margin-left: ${props => props.$sidebarOpen ? '280px' : '0'};
  transition: margin-left 0.3s ease;

  @media (max-width: 768px) {
    margin-left: 0;
  }
`;

const PageContainer = styled(motion.div)`
  flex: 1;
  padding: 2rem;
  max-width: 1200px;
  margin: 0 auto;
  width: 100%;

  @media (max-width: 768px) {
    padding: 1rem;
  }
`;

const pageVariants = {
  initial: { opacity: 0, y: 20 },
  in: { opacity: 1, y: 0 },
  out: { opacity: 0, y: -20 }
};

const pageTransition = {
  type: 'tween',
  ease: 'anticipate',
  duration: 0.4
};

function App() {
  const { isAuthenticated, loading } = useAuth();
  const getIsMobile = () => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false);
  const [isMobile, setIsMobile] = React.useState(getIsMobile);
  const [sidebarOpen, setSidebarOpen] = React.useState(() => (typeof window !== 'undefined' ? window.innerWidth > 768 : true));
  const previousIsMobile = React.useRef(isMobile);

  React.useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  React.useEffect(() => {
    if (isMobile) {
      setSidebarOpen(false);
    } else if (previousIsMobile.current) {
      setSidebarOpen(true);
    }

    previousIsMobile.current = isMobile;
  }, [isMobile]);

  if (loading) {
    return (
      <ThemeProvider theme={theme}>
        <AppContainer>
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            height: '100vh',
            fontSize: '1.2rem',
            color: '#64748b'
          }}>
            Loading...
          </div>
        </AppContainer>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={theme}>
      <AppContainer>
        <Routes>
        {/* Public Routes */}
        <Route 
          path="/login" 
          element={
            isAuthenticated ? <Navigate to="/dashboard" replace /> : <Login />
          } 
        />
        <Route 
          path="/register" 
          element={
            isAuthenticated ? <Navigate to="/dashboard" replace /> : <Register />
          } 
        />

        {/* Protected Routes */}
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <MainContent>
                <Sidebar 
                  isOpen={sidebarOpen} 
                  isMobile={isMobile}
                  onToggle={() => setSidebarOpen(prev => !prev)} 
                />
                <ContentArea $sidebarOpen={!isMobile && sidebarOpen}>
                  <Navbar onMenuClick={() => setSidebarOpen(!sidebarOpen)} />
                  <AnimatePresence mode="wait">
                    <Routes>
                      <Route 
                        path="/" 
                        element={<Navigate to="/dashboard" replace />} 
                      />
                      <Route 
                        path="/dashboard" 
                        element={
                          <PageContainer
                            initial="initial"
                            animate="in"
                            exit="out"
                            variants={pageVariants}
                            transition={pageTransition}
                          >
                            <Dashboard />
                          </PageContainer>
                        } 
                      />
                      <Route 
                        path="/chat" 
                        element={
                          <PageContainer
                            initial="initial"
                            animate="in"
                            exit="out"
                            variants={pageVariants}
                            transition={pageTransition}
                          >
                            <Chat />
                          </PageContainer>
                        } 
                      />
                      <Route 
                        path="/meal-plans" 
                        element={
                          <PageContainer
                            initial="initial"
                            animate="in"
                            exit="out"
                            variants={pageVariants}
                            transition={pageTransition}
                          >
                            <MealPlans />
                          </PageContainer>
                        } 
                      />
                      <Route 
                        path="/meal-plans/:id" 
                        element={
                          <PageContainer
                            initial="initial"
                            animate="in"
                            exit="out"
                            variants={pageVariants}
                            transition={pageTransition}
                          >
                            <MealPlanDetail />
                          </PageContainer>
                        } 
                      />
                      <Route 
                        path="/shopping-lists" 
                        element={
                          <PageContainer
                            initial="initial"
                            animate="in"
                            exit="out"
                            variants={pageVariants}
                            transition={pageTransition}
                          >
                            <ShoppingLists />
                          </PageContainer>
                        } 
                      />
                      <Route 
                        path="/shopping-lists/:id" 
                        element={
                          <PageContainer
                            initial="initial"
                            animate="in"
                            exit="out"
                            variants={pageVariants}
                            transition={pageTransition}
                          >
                            <ShoppingListDetail />
                          </PageContainer>
                        } 
                      />
                      <Route 
                        path="/settings" 
                        element={
                          <PageContainer
                            initial="initial"
                            animate="in"
                            exit="out"
                            variants={pageVariants}
                            transition={pageTransition}
                          >
                            <Settings />
                          </PageContainer>
                        } 
                      />
                      <Route 
                        path="/profile" 
                        element={
                          <PageContainer
                            initial="initial"
                            animate="in"
                            exit="out"
                            variants={pageVariants}
                            transition={pageTransition}
                          >
                            <Profile />
                          </PageContainer>
                        } 
                      />
                      <Route 
                        path="/stats" 
                        element={
                          <PageContainer
                            initial="initial"
                            animate="in"
                            exit="out"
                            variants={pageVariants}
                            transition={pageTransition}
                          >
                            <Stats />
                          </PageContainer>
                        } 
                      />
                      <Route 
                        path="/admin/logs" 
                        element={
                          <PageContainer
                            initial="initial"
                            animate="in"
                            exit="out"
                            variants={pageVariants}
                            transition={pageTransition}
                          >
                            <AdminLogs />
                          </PageContainer>
                        } 
                      />
                    </Routes>
                  </AnimatePresence>
                </ContentArea>
              </MainContent>
            </ProtectedRoute>
          }
        />
      </Routes>
    </AppContainer>
    </ThemeProvider>
  );
}

export default App;
