import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";

import { useAuthQuery } from "../../hooks/useAuth";

type ProtectedRouteProps = {
  children: ReactNode;
};

function ProtectedRoute({ children }: ProtectedRouteProps) {
  const authQuery = useAuthQuery();

  if (authQuery.isLoading) {
    return (
      <main className="mx-auto flex min-h-screen w-full items-center justify-center px-6 py-10">
        <p className="text-slate-600">Checking session...</p>
      </main>
    );
  }

  if (authQuery.isError) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

export default ProtectedRoute;
