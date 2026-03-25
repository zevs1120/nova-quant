import { useState } from 'react';
import useStatementFan from './hooks/useStatementFan.js';
import Header from './components/Header.jsx';
import HeroSection from './components/HeroSection.jsx';
import StatementSection from './components/StatementSection.jsx';
import ProofSection from './components/ProofSection.jsx';
import AskSection from './components/AskSection.jsx';
import PricingSection from './components/PricingSection.jsx';
import FaqSection from './components/FaqSection.jsx';
import VoicesSection from './components/VoicesSection.jsx';
import DistributionSection from './components/DistributionSection.jsx';
import LegalFooter from './components/LegalFooter.jsx';

export default function App() {
  const [activeStatementCard, setActiveStatementCard] = useState(2);
  const fan = useStatementFan(activeStatementCard);

  return (
    <div className="world">
      <div className="page-noise" aria-hidden="true" />
      <div className="page-gradient page-gradient-one" aria-hidden="true" />
      <div className="page-gradient page-gradient-two" aria-hidden="true" />

      <Header />

      <main className="page-shell" id="top">
        <HeroSection />
        <StatementSection
          activeCard={activeStatementCard}
          onCardSelect={setActiveStatementCard}
          fan={fan}
        />
        <ProofSection />
        <AskSection />
        <PricingSection />
        <FaqSection />
        <VoicesSection />
        <DistributionSection />
        <LegalFooter />
      </main>
    </div>
  );
}
