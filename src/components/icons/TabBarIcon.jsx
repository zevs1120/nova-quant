export default function TabBarIcon({ name }) {
  if (name === 'today') {
    return (
      <svg
        viewBox="0 0 24 24"
        className="native-tabbar-icon-svg"
        focusable="false"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.9" />
        <circle cx="12" cy="12" r="2.5" fill="currentColor" />
      </svg>
    );
  }

  if (name === 'nova') {
    return (
      <svg
        viewBox="0 0 24 24"
        className="native-tabbar-icon-svg"
        focusable="false"
        aria-hidden="true"
      >
        <path
          d="M12 4.8 13.7 10.3 19.2 12 13.7 13.7 12 19.2 10.3 13.7 4.8 12 10.3 10.3Z"
          fill="currentColor"
        />
      </svg>
    );
  }

  if (name === 'browse') {
    return (
      <svg
        viewBox="0 0 24 24"
        className="native-tabbar-icon-svg"
        focusable="false"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="4.75" fill="none" stroke="currentColor" strokeWidth="1.9" />
        <path
          d="M14.5 14.5 18.5 18.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 24 24"
      className="native-tabbar-icon-svg"
      focusable="false"
      aria-hidden="true"
    >
      <circle cx="12" cy="9" r="3.1" fill="none" stroke="currentColor" strokeWidth="1.9" />
      <path
        d="M6.6 18.2c1.4-2.6 3.2-3.9 5.4-3.9s4 1.3 5.4 3.9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  );
}
