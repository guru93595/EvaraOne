import { useAuth } from '../../context/AuthContext';

const AdminConfig = () => {
    const { user } = useAuth();

    return (
        <div>
            <h2 className="text-2xl font-bold text-slate-800 mb-6">System Configuration</h2>
            <p className="text-slate-500">
                {user?.role === 'distributor'
                    ? `Configuration settings for ${user.displayName}.`
                    : 'Global settings, firmware updates, and data rates.'}
            </p>
        </div>
    );
};

export default AdminConfig;
