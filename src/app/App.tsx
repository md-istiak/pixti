import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from '../components/layout/Layout.tsx';
import { routes } from './routes.tsx';

export function App() {
  return (
    <Layout>
      <Routes>
        {routes.map((r) => (
          <Route key={r.path} path={r.path} element={r.element} />
        ))}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
