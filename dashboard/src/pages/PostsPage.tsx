import { Navigate } from 'react-router-dom';

// Posts are now unified under the Library — redirect legacy route.
export default function PostsPage() {
    return <Navigate to="/library" replace />;
}
