import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';

const ProtectedRoute = ({ children }) => {
	const { user, loading } = useAuth();

	if (loading) {
		return <div className="min-h-screen bg-slate-50 p-6 text-slate-700">Loading...</div>;
	}

	if (!user) {
		return <Navigate to="/login" replace />;
	}

	return children;
};

export default ProtectedRoute;
