import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import LoginPage from "./pages/LoginPage.tsx";
import ChatPage from "./pages/ChatPage.tsx";
import ResearchPage from "./pages/ResearchPage.tsx";
import TicTacToePage from "./pages/TicTacToePage.tsx";
import GalleryPage from "./pages/GalleryPage.tsx";
import ProtectedRoute from "./components/auth/ProtectedRoute.tsx";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route
          path="/chat"
          element={
            <ProtectedRoute>
              <ChatPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/research"
          element={
            <ProtectedRoute>
              <ResearchPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/tictactoe"
          element={
            <ProtectedRoute>
              <TicTacToePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/gallery"
          element={
            <ProtectedRoute>
              <GalleryPage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
