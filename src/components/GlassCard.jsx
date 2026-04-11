import { memo } from 'react';

function GlassCard({ as: Component = 'article', className = '', children, ...props }) {
  return (
    <Component className={`glass-card ${className}`.trim()} {...props}>
      {children}
    </Component>
  );
}

export default memo(GlassCard);
