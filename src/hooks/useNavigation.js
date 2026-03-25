import { useCallback, useState } from 'react';
import { MENU_PARENTS } from '../config/appConstants';

/**
 * Manages My-tab stack navigation, menu section routing, AI seed requests,
 * and cross-tab navigation from the AI assistant.
 */
export function useNavigation() {
  const [activeTab, setActiveTab] = useState('today');
  const [myStack, setMyStack] = useState(['portfolio']);
  const [aiSeedRequest, setAiSeedRequest] = useState(null);

  const mySection = myStack[myStack.length - 1] || 'portfolio';

  const buildMyStack = useCallback((section) => {
    if (!section || section === 'portfolio') return ['portfolio'];
    if (section === 'menu') return ['portfolio', 'menu'];
    if (section.startsWith('group:')) return ['portfolio', 'menu', section];
    const parent = MENU_PARENTS[section];
    return parent ? ['portfolio', 'menu', parent, section] : ['portfolio', 'menu', section];
  }, []);

  const resetMy = useCallback(() => {
    setMyStack(['portfolio']);
  }, []);

  const openMySection = useCallback(
    (section) => {
      setMyStack(buildMyStack(section));
      setActiveTab('my');
    },
    [buildMyStack],
  );

  const pushMySection = useCallback((section) => {
    if (!section || section === 'portfolio') {
      setMyStack(['portfolio']);
      return;
    }
    setMyStack((current) => {
      const currentTop = current[current.length - 1];
      if (currentTop === section) return current;
      return [...current, section];
    });
  }, []);

  const popMySection = useCallback(() => {
    setMyStack((current) => (current.length > 1 ? current.slice(0, -1) : current));
  }, []);

  const askAi = useCallback(
    (message, context = {}, baseContext = {}) => {
      const text = String(message || '').trim();
      if (!text) return;
      setAiSeedRequest({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        message: text,
        context: {
          page: activeTab === 'my' ? mySection || 'my' : activeTab,
          ...baseContext,
          ...(context || {}),
        },
      });
      setActiveTab('ai');
    },
    [activeTab, mySection],
  );

  const navigateFromAi = useCallback(
    (target) => {
      if (!target) return;
      if (target === 'holdings') {
        setActiveTab('my');
        setMyStack(['portfolio']);
        return;
      }
      if (target === 'more') {
        openMySection('menu');
        return;
      }
      if (target.startsWith('more:') || target.startsWith('menu:') || target.startsWith('my:')) {
        const section = target.split(':')[1] || 'menu';
        openMySection(section);
        return;
      }
      setActiveTab(target);
      if (target !== 'my') setMyStack(['portfolio']);
    },
    [openMySection],
  );

  return {
    activeTab,
    setActiveTab,
    myStack,
    setMyStack,
    mySection,
    aiSeedRequest,
    resetMy,
    openMySection,
    pushMySection,
    popMySection,
    askAi,
    navigateFromAi,
  };
}
