const BANNED_PHRASES = [
  '快冲',
  '马上上车',
  '错过',
  '抄底',
  '必赚',
  'guaranteed',
  'must-buy',
  'act now',
  'moonshot',
  '宝贝',
  '冲啊'
];

export const NOVA_BRAND_VOICE = {
  en: {
    identity: 'A calm, sharp, evidence-first decision companion.',
    principles: [
      'Invite the user back to confirm, not to chase.',
      'Protect judgment before expanding risk.',
      'Sound alive, but never loud.',
      'Use wit to clarify, not to entertain.',
      'Let waiting feel deliberate, not empty.'
    ],
    opportunity: 'Speak with clarity and restraint. Opportunity is permission to focus, not permission to get excited.',
    risk: 'Name the boundary plainly. Risk language should feel like a steady hand, not a siren.',
    doNotAct: 'Frame no-action as intelligent capital preservation and decision quality, not absence.',
    returnInvite: 'Invite the user back for a clean check-in because the judgment moved or deserves confirmation.',
    noActionValue: 'No-action is often a premium decision. Say that directly and with composure.',
    impulsiveIntervention: 'Sound like you are putting a hand on the user’s shoulder, not wagging a finger.',
    temperedOpportunity: 'You can acknowledge clarity without inflating certainty.'
  },
  zh: {
    identity: '一个冷静、锋利、证据优先的决策搭子。',
    principles: [
      '邀请用户回来确认，不催用户追逐。',
      '先保护判断，再考虑放大风险。',
      '有生命感，但绝不喧闹。',
      '允许一点机灵，但不拿市场开低级玩笑。',
      '让等待看起来像成熟判断，而不是空白。'
    ],
    opportunity: '表达机会时要清晰、克制。机会只是允许聚焦，不是允许兴奋。',
    risk: '表达风险时要把边界讲清，不制造惊慌。',
    doNotAct: '表达不要动时，要像保护资本和判断，而不是系统没内容。',
    returnInvite: '召回用户时是请他回来确认，不是催他回来处理刺激。',
    noActionValue: '明确告诉用户：无动作本身就是一种高质量动作。',
    impulsiveIntervention: '像按住用户的手，而不是教训用户。',
    temperedOpportunity: '允许承认机会，但绝不把一点确定性说成全场明牌。'
  }
};

export const NOVA_PLAYFUL_BOUNDARY = {
  allowed: [
    'Light dry wit about noise, impatience, or false certainty.',
    'Elegant language that makes waiting feel intelligent.',
    'Protective sharpness on high-risk days.',
    'A tiny bit of personality when reminding the user to slow down.'
  ],
  forbidden: [
    'Fear-of-missing-out language.',
    'Mascot-style cuteness or baby talk.',
    'Gambling energy, countdown pressure, or hype.',
    'Forced literary flourish that obscures meaning.',
    'Any line that rewards frequent trading.'
  ]
};

export const NOVA_TONE_MATRIX = {
  defensive: {
    summary: 'Steady, protective, slightly sharper.',
    motionTone: 'contained',
    language: ['boundary first', 'no rush', 'capital protection']
  },
  cautious: {
    summary: 'Measured, selective, unfinished.',
    motionTone: 'soft',
    language: ['selective', 'smaller risk', 'still mixed']
  },
  observe: {
    summary: 'Quiet, composed, deliberate.',
    motionTone: 'quiet',
    language: ['watch first', 'nothing to prove', 'leave space']
  },
  probe: {
    summary: 'Lightly active, still disciplined.',
    motionTone: 'measured',
    language: ['probe small', 'do not over-read', 'only the clean one']
  },
  opportunity: {
    summary: 'Clearer, crisper, but not excited.',
    motionTone: 'crisp',
    language: ['permission to focus', 'still sized', 'clarity is not a reason to rush']
  },
  watchful: {
    summary: 'Watchful, selective, lightly suspended.',
    motionTone: 'measured',
    language: ['partial permission', 'observe before expanding', 'leave room for doubt']
  },
  quiet: {
    summary: 'Quiet, complete, intentionally uneventful.',
    motionTone: 'minimal',
    language: ['nothing to force', 'completion through restraint', 'calm over motion']
  }
};

const COPY_LIBRARY = {
  en: {
    dailyStance: {
      ATTACK: {
        ultraShort: ['Selective action is on the table.'],
        standard: [
          'Risk has eased. Focus beats force today.',
          'Conditions allow action, but only on the clearest card.',
          'The market is more open today, not more forgiving.'
        ],
        restrained: [
          'Risk has eased, but not enough to justify carelessness.',
          'There is room to act. Discipline still sets the size.'
        ],
        sharp: ['You have permission to focus, not permission to get loud.']
      },
      PROBE: {
        ultraShort: ['Today is for small, clean tests.'],
        standard: [
          'Conditions are mixed. If you act, keep it small.',
          'This is a day for calibration, not expansion.',
          'You can test ideas today. You do not need to prove them.'
        ],
        restrained: [
          'Some setups are workable, but the day still favors selectivity.',
          'There is enough clarity to probe, not enough to relax.'
        ],
        sharp: ['You are allowed to explore the edge, not to lean over it.']
      },
      DEFEND: {
        ultraShort: ['Today favors defense.'],
        standard: [
          'Today is for protecting ground, not taking more.',
          'The market is offering motion, not clean permission.',
          'Risk has the upper hand today. Keep your hand off the throttle.'
        ],
        restrained: [
          'This is a better day to preserve options than to spend them.',
          'The cleanest action today may be restraint.'
        ],
        sharp: ['If you feel an urge to prove yourself today, the market probably will not help.']
      },
      WAIT: {
        ultraShort: ['Today is better used for confirmation.'],
        standard: [
          'The market gave noise, not enough clarity.',
          'Today is not a good day to enlarge risk.',
          'The useful action today is to confirm, then wait.'
        ],
        restrained: [
          'Nothing is broken, but nothing is clear enough to press.',
          'This is a day to keep the slate clean.'
        ],
        sharp: ['Do not confuse empty space with an invitation to fill it.']
      }
    },
    todayRisk: {
      ATTACK: {
        label: 'Risk has eased',
        explanation: [
          'The climate allows selective action.',
          'Conditions are steadier, not harmless.'
        ],
        deltaUp: ['Risk cooled from yesterday. You still do not need to swing hard.'],
        deltaFlat: ['Risk remains manageable. Size stays part of the discipline.']
      },
      PROBE: {
        label: 'Risk is mixed',
        explanation: [
          'This is a selective day, not a broad green light.',
          'A few setups may work. Most do not need your attention.'
        ],
        deltaUp: ['Risk eased a little, but not enough to relax.'],
        deltaFlat: ['The tone is still mixed. Keep the bar high.']
      },
      DEFEND: {
        label: 'Risk is elevated',
        explanation: [
          'Protection matters more than expansion.',
          'Today is asking for judgment, not bravado.'
        ],
        deltaUp: ['Risk stepped higher. It is a day for boundaries.'],
        deltaFlat: ['Risk is still pressing. You do not need to force an answer.']
      },
      WAIT: {
        label: 'Clarity is limited',
        explanation: [
          'The day is better used to verify than to act.',
          'Data or conditions are not clean enough for high-risk moves.'
        ],
        deltaUp: ['Clarity has not improved enough to justify action.'],
        deltaFlat: ['The edge is still too soft to lean on.']
      }
    },
    morningCheck: {
      PENDING: {
        title: 'Morning Check',
        shortLabel: 'Pending',
        headline: ['The view is ready. Confirm it before the day gets louder.'],
        prompt: [
          'You only need a few seconds. Confirm the climate, then decide whether today deserves action.',
          'Do not read the whole market. Confirm the one judgment that matters.'
        ],
        completion: ['Today’s most important action may simply be this: confirm first.'],
        cta: 'Confirm today',
        aiCta: 'Why this view?'
      },
      REFRESH_REQUIRED: {
        title: 'Morning Check',
        shortLabel: 'Updated',
        headline: ['The view moved. It is worth another look.'],
        prompt: [
          'The system updated its judgment. Come back for the change, not for more noise.',
          'Something meaningful shifted. Re-check before carrying the morning forward.'
        ],
        completion: ['The update is the point. Re-confirm before you trust yesterday’s tone.'],
        cta: 'Re-check today',
        aiCta: 'What changed?'
      },
      COMPLETED: {
        title: 'Morning Check',
        shortLabel: 'Confirmed',
        headline: ['Today’s judgment is already confirmed.'],
        prompt: [
          'You already did the important part. The rest is execution discipline.',
          'The day has been checked. You do not need to keep squeezing it for more certainty.'
        ],
        completion: ['Today is already anchored. The goal now is not to drift.'],
        cta: 'Today noted',
        aiCta: 'Explain the view'
      }
    },
    morningArrival: {
      ATTACK: ['Today’s conclusion arrived cleanly. Keep your size quieter than your confidence.'],
      PROBE: ['Today opens with a partial yes. That is enough to focus, not enough to sprawl.'],
      DEFEND: ['Today’s conclusion is a boundary, not a dare.'],
      WAIT: ['Today arrived with more question marks than permission.']
    },
    morningRitual: {
      ATTACK: ['Confirm first. Action comes second.'],
      PROBE: ['Check the climate before you touch the throttle.'],
      DEFEND: ['Start by seeing the line. You do not need to cross it.'],
      WAIT: ['See the day clearly. Leave the empty space empty if it deserves it.']
    },
    morningHumor: {
      ATTACK: ['The market is clearer today. That is still not a request for theatrics.'],
      PROBE: ['A little signal is not the same thing as a full invitation.'],
      DEFEND: ['If you are itching to do something, the market may be better at teaching than forgiving.'],
      WAIT: ['The tape has opinions today. None of them are binding on you.']
    },
    perception: {
      badge: 'System view',
      ambientLabel: 'Decision climate',
      arriving: {
        ATTACK: [
          'The system already narrowed the board. You only need the clean confirmation.',
          'The first layer of thinking is done. What remains is disciplined focus.'
        ],
        PROBE: [
          'The system found the narrow edge. Your job is to confirm it, not to widen it.',
          'The board is already filtered. Keep the next move smaller than your curiosity.'
        ],
        DEFEND: [
          'The system made the first risk read for you. What remains is keeping your hands steady.',
          'Today arrived as a boundary, not as a request for more action.'
        ],
        WAIT: [
          'The system read the noise and kept only the useful part: restraint.',
          'The first judgment is already on the table. You do not need a second market to confirm it.'
        ]
      },
      shifted: {
        ATTACK: [
          'The view sharpened. Take the updated read, not the mood you woke up with.'
        ],
        PROBE: [
          'The tone moved. A fresh confirmation matters more than a faster reaction.'
        ],
        DEFEND: [
          'The line moved. The useful action now is to notice that before you do anything else.'
        ],
        WAIT: [
          'The day changed just enough to deserve another clean look, not a louder response.'
        ]
      },
      anchored: {
        ATTACK: [
          'Today’s view is already anchored. You do not need to keep asking the market for permission.'
        ],
        PROBE: [
          'The day is already calibrated. Let discipline do the rest of the work.'
        ],
        DEFEND: [
          'Today is already anchored around restraint. That is a position, not an omission.'
        ],
        WAIT: [
          'The quiet answer is already locked in. Nothing else needs to be forced into it.'
        ]
      },
      focus: {
        actionable: {
          ATTACK: [
            'The lead card already did the hard part: it reduced the whole market to one decision worth attention.'
          ],
          PROBE: [
            'The lead card matters because it is the only place the day looks remotely clean.'
          ],
          DEFEND: [
            'The lead card is mainly a control point. Respecting it matters more than chasing around it.'
          ],
          WAIT: [
            'If a card is still on top today, its first job is to explain the boundary, not to trigger motion.'
          ]
        },
        noAction: {
          ATTACK: [
            'Clarity improved, but not enough to earn a louder move.'
          ],
          PROBE: [
            'The useful outcome today is that nothing earned the right to drag you around.'
          ],
          DEFEND: [
            'Today’s cleanest result is that the system filtered out the unnecessary urge to do more.'
          ],
          WAIT: [
            'The market still owes you a better reason than motion alone.'
          ]
        }
      }
    },
    noAction: {
      arrival: [
        'Today’s best action may already be on the table: wait well.',
        'The cleanest move today is to leave risk where it is.'
      ],
      completion: [
        'No action was not an omission. It was the decision.',
        'Today stayed clean because you did not force it.',
        'The market offered movement. You asked for quality instead.'
      ],
      wrap: [
        'The day did not need more action. It needed fewer mistakes.',
        'Nothing dramatic happened, and that may be the best part of today.'
      ],
      notify: [
        'Worth a quick return: the system still prefers patience.',
        'The useful update today is that waiting remains the right posture.'
      ]
    },
    actionCard: {
      title: 'Today\'s Best Action',
      riskTitle: 'Today Risk',
      moreRanked: 'More ranked actions',
      recentSignals: 'Recent signals',
      askNova: 'Ask Nova',
      openWrap: 'Open wrap-up',
      badges: {
        rank: 'Rank #1',
        updated: 'Updated',
        checked: 'Confirmed',
        restraint: 'No rush',
        watched: 'Seen today',
        actionable: 'Actionable',
        watchOnly: 'Watch only',
        cautionUp: 'Caution up',
        thesisWeakened: 'Thesis softer',
        invalidated: 'Invalidated'
      },
      whyNow: {
        ATTACK: [
          'This card is first because it is the cleanest expression of today’s opportunity.',
          'This is the one card that deserves focus before the rest of the board.'
        ],
        PROBE: [
          'This card is first, but still belongs in a small-size mindset.',
          'It ranks highest because the rest of the board is even less complete.'
        ],
        DEFEND: [
          'This card matters because it defines the boundary, not because it invites aggression.',
          'It is top-ranked mainly as a control point, not a chase candidate.'
        ],
        WAIT: [
          'The best card today may simply explain why nothing else deserves action.',
          'This card leads because it still tells you the most about the day, even if the day stays quiet.'
        ]
      },
      caution: {
        ATTACK: ['Clarity improved. That still does not excuse oversized conviction.'],
        PROBE: ['Treat this like a test, not a thesis victory lap.'],
        DEFEND: ['If this card tempts you to get bigger, read the risk box again.'],
        WAIT: ['A card can be useful without being actionable.']
      },
      invalidation: {
        actionable: ['If the premise weakens, size should disappear faster than confidence does.'],
        watchOnly: ['If the premise does not strengthen, the right outcome is still no action.']
      },
      timeHorizon: {
        short: 'short horizon',
        swing: 'days to weeks',
        watch: 'watch closely'
      },
      viewExplain: [
        'See why this card is here',
        'Open the evidence behind this card'
      ]
    },
    widget: {
      state: {
        ATTACK: {
          title: ['Selective action'],
          caption: ['Focus, not force.']
        },
        PROBE: {
          title: ['Light probe'],
          caption: ['The board is mixed.']
        },
        DEFEND: {
          title: ['Defensive'],
          caption: ['Boundaries matter more today.']
        },
        WAIT: {
          title: ['Confirm first'],
          caption: ['The edge is still thin.']
        }
      },
      change: {
        risk_shift: ['The weather changed.'],
        top_action_shift: ['The lead card rotated.'],
        stable: ['The view held.'],
        wrap_ready: ['The day is ready to close.']
      },
      spark: {
        ATTACK: ['A cleaner board is not a louder board.'],
        PROBE: ['A narrow yes is still a yes. Keep it narrow.'],
        DEFEND: ['Today is asking for calm hands.'],
        WAIT: ['A quiet board can still be a useful one.']
      }
    },
    notifications: {
      RHYTHM: {
        title: ['Today’s view is ready', 'Today’s check-in is ready'],
        body: {
          ATTACK: ['Worth a quick return. Conditions improved, but size still matters.'],
          PROBE: ['Worth a quick return. Today looks selective, not wide open.'],
          DEFEND: ['Worth a quick return. Today is more about boundaries than action.'],
          WAIT: ['Worth a quick return. Today still looks better for confirmation than motion.']
        }
      },
      STATE_SHIFT: {
        title: ['The day changed shape', 'The climate shifted'],
        body: {
          risk_shift: ['The risk posture moved. Re-check before carrying the earlier tone forward.'],
          top_action_shift: ['The lead card changed. The useful update is ranking, not noise.'],
          stable: ['The view held. One calm check is enough.']
        }
      },
      PROTECTIVE: {
        title: ['This is a day for restraint', 'More risk is not the point today'],
        body: {
          DEFEND: ['You are better served by boundaries than by fresh exposure.'],
          WAIT: ['Clarity is still not paying enough to justify bigger risk.'],
          overlap: ['Your current exposure already overlaps enough. New action deserves a harder filter.']
        }
      },
      WRAP_UP: {
        title: ['Tonight’s wrap-up is ready', 'The day is ready to close'],
        body: {
          ATTACK: ['Tonight is for understanding what mattered, not reliving every move.'],
          PROBE: ['A quick wrap-up will tell you whether today was signal or noise.'],
          DEFEND: ['Tonight’s useful lesson may be what you did not force.'],
          WAIT: ['A quiet day still leaves a useful trace.']
        }
      }
    },
    discipline: {
      steady: [
        'Your rhythm is getting steadier. The point is not activity, it is judgment quality.',
        'You are building a habit of checking first and acting second.'
      ],
      building: [
        'The habit is taking shape. Consistency matters more than intensity.',
        'You are turning confirmation into a routine instead of a scramble.'
      ],
      early: [
        'Start with the rhythm. The discipline comes before the edge.',
        'The system does not need more action from you. It needs one clean check each day.'
      ],
      noAction: [
        'Today stayed intact because you did not make it busier than it needed to be.',
        'You did not let the market rent your attention by the hour.'
      ]
    },
    wrapUp: {
      title: 'Evening Wrap-Up',
      shortReady: 'Ready',
      shortDone: 'Done',
      headlineReady: ['Tonight is worth one clean look.'],
      headlineDone: ['Today has been closed out.'],
      opening: {
        ATTACK: ['Close the day without enlarging the story.'],
        PROBE: ['Wrap the day while it still looks proportionate.'],
        DEFEND: ['The day is easier to trust once it is properly closed.'],
        WAIT: ['A quiet day still deserves a clean ending.']
      },
      completion: [
        'The day is closed. What remains should be memory, not momentum.',
        'Wrap-up done. The point is to leave the day cleaner than you found it.'
      ],
      noAction: [
        'Today’s lesson may simply be that you did not let motion impersonate opportunity.',
        'The day never paid enough to deserve a forced response.'
      ]
    },
    assistant: {
      opener: {
        calm: ['Let’s keep this simple.', 'Let’s look at what actually changed.'],
        protective: ['Let’s not give noise more authority than it deserves.', 'Before we touch the idea, let’s check the boundary.'],
        opportunity: ['There may be something workable here. We still do not need to rush it.']
      },
      riskExplain: [
        'The system is not trying to be exciting here. It is trying to be right enough to stay useful.',
        'This is more about where the line is than how many opinions the market has today.'
      ],
      intercept: [
        'If you feel urgency before clarity, that is usually the first thing to distrust.',
        'A fast heartbeat is not part of the evidence set.'
      ],
      noAction: [
        'Nothing broke here. The day simply did not earn fresh risk.',
        'The useful decision can still be to leave the portfolio exactly where it is.'
      ],
      wrap: [
        'The lesson today may be smaller than the noise and more valuable than it looks.',
        'A good wrap-up is usually quieter than the day itself.'
      ]
    }
  },
  zh: {
    dailyStance: {
      ATTACK: {
        ultraShort: ['今天可以聚焦机会。'],
        standard: ['风险回落了，但不等于可以放松。', '今天有动作空间，但只属于最清楚的那一张卡。'],
        restrained: ['今天可以做，但仍然要让纪律决定大小。'],
        sharp: ['今天给了你聚焦的许可，不是放大自信的许可。']
      },
      PROBE: {
        ultraShort: ['今天适合小试，不适合放大。'],
        standard: ['今天更像校准判断，不像扩大风险。', '可以试探，但只限最干净的那一下。'],
        restrained: ['今天有一点清晰，但还不到可以松手的时候。'],
        sharp: ['可以伸手试边界，但别把手臂整个探出去。']
      },
      DEFEND: {
        ultraShort: ['今天优先防守。'],
        standard: ['今天更像守住地盘，不像再拿更多。', '市场给了波动，但没给你逞强的理由。'],
        restrained: ['今天更适合保留选择权，而不是消耗它。'],
        sharp: ['如果你今天想证明什么，市场大概率不会配合。']
      },
      WAIT: {
        ultraShort: ['今天更适合确认，不适合动作。'],
        standard: ['今天更适合确认判断，而不是扩大风险。', '市场说了很多话，但还没说出一句值得你立刻相信的。'],
        restrained: ['没有坏到必须动作，也没有清楚到值得出手。'],
        sharp: ['别把留白误会成你必须去填满的地方。']
      }
    },
    todayRisk: {
      ATTACK: { label: '风险回落', explanation: ['今天可以有选择地动作。'], deltaUp: ['风险比昨天轻一点，但仍然不需要激进。'], deltaFlat: ['风险仍可控，仓位依旧属于纪律的一部分。'] },
      PROBE: { label: '风险偏混合', explanation: ['今天是选择日，不是全场绿灯。'], deltaUp: ['风险回落了一点，但还不到可以放松。'], deltaFlat: ['气候仍偏混合，门槛继续放高。'] },
      DEFEND: { label: '风险偏高', explanation: ['今天更需要边界，而不是新风险。'], deltaUp: ['风险进一步抬高，先守线。'], deltaFlat: ['风险压力还在，你不需要强行给市场答案。'] },
      WAIT: { label: '清晰度不足', explanation: ['今天更适合验证，不适合高风险动作。'], deltaUp: ['清晰度还没好到值得动作。'], deltaFlat: ['边还太软，不值得靠过去。'] }
    },
    morningCheck: {
      PENDING: { title: 'Morning Check', shortLabel: '待确认', headline: ['今天的判断已经到了，先确认。'], prompt: ['不用研究很久，只要确认今天该不该动。'], completion: ['你今天最重要的动作，是先确认判断。'], cta: '确认今天判断', aiCta: '为什么这样看' },
      REFRESH_REQUIRED: { title: 'Morning Check', shortLabel: '已更新', headline: ['判断变了，值得再看一眼。'], prompt: ['系统更新了判断，先确认变化，再决定要不要动作。'], completion: ['先重新校准，再延续今天的动作。'], cta: '重新确认', aiCta: '哪里变了' },
      COMPLETED: { title: 'Morning Check', shortLabel: '已确认', headline: ['今天的判断已经确认。'], prompt: ['最重要的动作已经完成，接下来只剩执行纪律。'], completion: ['今天已经锚定，不需要反复拧紧它。'], cta: '今日已记下', aiCta: '解释判断' }
    },
    morningArrival: {
      ATTACK: ['今天的结论更清楚了，但你的动作不需要更大。'],
      PROBE: ['今天是半个肯定，不是全面放行。'],
      DEFEND: ['今天递到你眼前的是边界，不是胆量测试。'],
      WAIT: ['今天到来的不是答案，而是更清楚的留白。']
    },
    morningRitual: {
      ATTACK: ['先确认，再动手。'],
      PROBE: ['先看清气候，再碰风险。'],
      DEFEND: ['先把线看见，你不需要跨过去。'],
      WAIT: ['先把今天看清，不急着填满空白。']
    },
    morningHumor: {
      ATTACK: ['今天更清楚一点，不代表你可以更戏剧化。'],
      PROBE: ['一点把握，不等于全场明牌。'],
      DEFEND: ['今天如果你手痒，市场大概率更擅长教育而不是原谅。'],
      WAIT: ['今天市场意见很多，但没一句是你必须立刻签收的。']
    },
    perception: {
      badge: '系统判断',
      ambientLabel: '判断气候',
      arriving: {
        ATTACK: [
          '系统已经先帮你缩小了选择面。你现在只需要做一次干净确认。',
          '第一层判断已经完成，剩下的是克制地聚焦。'
        ],
        PROBE: [
          '系统已经先筛出今天那条窄边。你要做的是确认，不是把它脑补成全场放行。'
        ],
        DEFEND: [
          '系统已经先替你做了风险初判，接下来更重要的是把手稳住。',
          '今天先递到你眼前的是边界，不是新的胆量测试。'
        ],
        WAIT: [
          '系统已经先把噪音吞掉，留下来的有价值部分叫克制。',
          '第一层判断已经在桌上了，你不需要再去市场里捞一个更吵的答案。'
        ]
      },
      shifted: {
        ATTACK: ['今天的判断变得更清楚了。先接住更新，再谈动作。'],
        PROBE: ['气候动了，先校准，再反应。'],
        DEFEND: ['边界变了。你现在最该做的，是先看见这件事。'],
        WAIT: ['今天的留白有变化，值得回来重新确认一次。']
      },
      anchored: {
        ATTACK: ['今天的判断已经锚定，不需要再反复向市场索取许可。'],
        PROBE: ['今天已经校准过了，接下来交给纪律。'],
        DEFEND: ['今天已经锚定在克制上，这不是空白，是立场。'],
        WAIT: ['安静的答案已经定下来了，不需要再硬往里塞动作。']
      },
      focus: {
        actionable: {
          ATTACK: ['榜首卡片已经替你做了最难的事：把全市场缩成一个值得注意的判断对象。'],
          PROBE: ['榜首卡片之所以重要，是因为今天真正勉强够干净的地方本来就不多。'],
          DEFEND: ['榜首卡片更像控制点。尊重它，比围着它兴奋更重要。'],
          WAIT: ['今天如果还有卡片留在榜首，它的第一价值也是解释边界，而不是制造动作。']
        },
        noAction: {
          ATTACK: ['清晰度是回来了，但还没高到值得把动作一起放大。'],
          PROBE: ['今天最有价值的结果，是没有一张卡真正获得拖着你走的资格。'],
          DEFEND: ['今天系统替你筛掉的，正是那些本来不需要发生的冲动。'],
          WAIT: ['市场还欠你一个比“有波动”更像样的理由。']
        }
      }
    },
    noAction: {
      arrival: ['今天最好的动作，也许已经摆在你面前：等得漂亮一点。'],
      completion: ['今天没乱动，不是空白，是完成。', '今天最好的动作，很可能就是没有追出去。'],
      wrap: ['今天不需要更多动作，它只需要更少错误。'],
      notify: ['值得回来确认一下：等待仍然是更优动作。']
    },
    actionCard: {
      title: '今日第一判断',
      riskTitle: 'Today Risk',
      moreRanked: '更多排序动作',
      recentSignals: '最近信号',
      askNova: 'Ask Nova',
      openWrap: '打开复盘',
      badges: {
        rank: '第 1 位',
        updated: '已更新',
        checked: '已确认',
        restraint: '不着急',
        watched: '已看过',
        actionable: '可动作',
        watchOnly: '先观察',
        cautionUp: '风险抬高',
        thesisWeakened: '前提转弱',
        invalidated: '已失效'
      },
      whyNow: {
        ATTACK: ['这张卡排第一，是因为它最清楚，不是因为今天必须做很多。'],
        PROBE: ['它排第一，但仍然只配得上小仓位心态。'],
        DEFEND: ['它排第一，更像边界提示，不像进攻许可。'],
        WAIT: ['今天最重要的卡，可能恰恰是在解释为什么没有动作。']
      },
      caution: {
        ATTACK: ['清晰度上来了，不代表你可以把仓位也一起放大。'],
        PROBE: ['把它当成试探，不要当成胜利巡游。'],
        DEFEND: ['如果这张卡让你想变大，请先再看一遍风险框。'],
        WAIT: ['一张卡有信息价值，不代表它有执行价值。']
      },
      invalidation: {
        actionable: ['前提一旦弱掉，仓位要比自信更快消失。'],
        watchOnly: ['如果前提没有变强，正确结果仍然是不动作。']
      },
      timeHorizon: { short: '短周期', swing: '几天到几周', watch: '继续观察' },
      viewExplain: ['看这张卡为什么在这里']
    },
    widget: {
      state: {
        ATTACK: { title: ['可聚焦'], caption: ['有机会，但仍需收着。'] },
        PROBE: { title: ['轻试探'], caption: ['今天更适合选择。'] },
        DEFEND: { title: ['偏防守'], caption: ['今天边界更重要。'] },
        WAIT: { title: ['先确认'], caption: ['今天边还太薄。'] }
      },
      change: { risk_shift: ['今天的气候变了'], top_action_shift: ['榜首卡片换人了'], stable: ['判断保持稳定'], wrap_ready: ['今天可以收束了'] },
      spark: {
        ATTACK: ['今天更清楚，但不需要更大声。'],
        PROBE: ['半个肯定，也是肯定。记得只拿半步。'],
        DEFEND: ['今天适合稳手，而不是快手。'],
        WAIT: ['今天安静一点，反而更值钱。']
      }
    },
    notifications: {
      RHYTHM: {
        title: ['今早判断已更新', '今天值得回来确认一下'],
        body: {
          ATTACK: ['今天更清楚了一点，但仓位仍然要克制。'],
          PROBE: ['今天可试探，但不属于放大风险的日子。'],
          DEFEND: ['今天更需要边界，不需要冲出去。'],
          WAIT: ['今天仍然更适合确认，而不是动作。']
        }
      },
      STATE_SHIFT: {
        title: ['今天的气候变了', '榜首判断更新了'],
        body: {
          risk_shift: ['系统的风险姿态变了，值得回来重新校准一次。'],
          top_action_shift: ['榜首卡片换了，这更像判断更新，不像噪音。'],
          stable: ['核心判断没变，回来确认一次就够了。']
        }
      },
      PROTECTIVE: {
        title: ['现在更值得做的是克制', '今天不是扩大风险的日子'],
        body: {
          DEFEND: ['今天更需要守线，而不是加新风险。'],
          WAIT: ['清晰度还没高到值得你把仓位放大。'],
          overlap: ['你当前的曝险已经不轻，新动作应该更挑剔。']
        }
      },
      WRAP_UP: {
        title: ['今晚复盘已准备好', '今天可以收束了'],
        body: {
          ATTACK: ['今晚值得看的不是多刺激，而是什么真正有效。'],
          PROBE: ['今晚看一眼复盘，就能知道今天到底是信号还是噪音。'],
          DEFEND: ['今晚最值得记住的，可能是你没有乱动。'],
          WAIT: ['安静的一天，也有值得记住的东西。']
        }
      }
    },
    discipline: {
      steady: ['你的节奏正在变稳。现在积累的是判断质量，不是动作次数。'],
      building: ['习惯在成形，持续回来确认，比一时兴奋更重要。'],
      early: ['先把节奏建立起来。纪律要先于机会。'],
      noAction: ['今天没有被市场牵着走，这本身就是判断力。']
    },
    wrapUp: {
      title: 'Evening Wrap-Up',
      shortReady: '可复盘',
      shortDone: '已复盘',
      headlineReady: ['今晚值得看一眼复盘。'],
      headlineDone: ['今天已经收束。'],
      opening: {
        ATTACK: ['把今天收好，不要把它讲得比它本身更大。'],
        PROBE: ['趁今天还算清晰，把它收束一下。'],
        DEFEND: ['一天被好好收住之后，才更值得相信。'],
        WAIT: ['安静的一天，也值得一个干净结尾。']
      },
      completion: ['复盘完成。今天留下的是判断，不是余波。'],
      noAction: ['今天最有价值的，可能就是你没让波动冒充机会。']
    },
    assistant: {
      opener: {
        calm: ['我们先把这件事看简单一点。'],
        protective: ['先别把噪音抬成命令。'],
        opportunity: ['这里也许有点东西，但先别把自信放大。']
      },
      riskExplain: ['系统现在更在乎边界在哪里，而不是市场今天有多少意见。'],
      intercept: ['如果急迫感先于清晰度出现，先怀疑急迫感。'],
      noAction: ['今天不是没内容，只是没赚到新风险的资格。'],
      wrap: ['今天真正值得留下来的，往往比白天看起来更安静。']
    }
  }
};

function normalizePosture(posture) {
  const upper = String(posture || '').trim().toUpperCase();
  return ['ATTACK', 'PROBE', 'DEFEND', 'WAIT'].includes(upper) ? upper : 'WAIT';
}

export function normalizeNovaLocale(locale) {
  const value = String(locale || '').toLowerCase();
  return value.startsWith('zh') ? 'zh' : 'en';
}

function hashSeed(seed) {
  const text = String(seed || 'nova');
  let out = 0;
  for (let i = 0; i < text.length; i += 1) out = (out * 31 + text.charCodeAt(i)) >>> 0;
  return out;
}

function choose(list, seed, fallback = '') {
  if (!Array.isArray(list) || !list.length) return fallback;
  return list[hashSeed(seed) % list.length] || fallback;
}

function guard(text, fallback) {
  const output = String(text || fallback || '').trim();
  const lower = output.toLowerCase();
  if (BANNED_PHRASES.some((phrase) => lower.includes(String(phrase).toLowerCase()))) {
    return String(fallback || '').trim();
  }
  return output;
}

function library(locale) {
  return COPY_LIBRARY[normalizeNovaLocale(locale)];
}

function postureTone(posture) {
  const normalized = normalizePosture(posture);
  if (normalized === 'ATTACK') return 'opportunity';
  if (normalized === 'PROBE') return 'watchful';
  if (normalized === 'DEFEND') return 'defensive';
  return 'quiet';
}

export function getBrandVoiceConstitution(locale = 'en') {
  return {
    locale: normalizeNovaLocale(locale),
    ...NOVA_BRAND_VOICE[normalizeNovaLocale(locale)],
    playful_boundary: NOVA_PLAYFUL_BOUNDARY,
    banned_phrases: [...BANNED_PHRASES]
  };
}

export function getToneMatrix(locale = 'en') {
  return {
    locale: normalizeNovaLocale(locale),
    matrix: NOVA_TONE_MATRIX
  };
}

export function getPlayfulnessPrinciples(locale = 'en') {
  return {
    locale: normalizeNovaLocale(locale),
    definition:
      normalizeNovaLocale(locale) === 'zh'
        ? 'NovaQuant 的有趣，是克制里的机灵感、安静里的完成感、判断里的轻微幽默。'
        : 'NovaQuant playfulness is composed wit: a little life, a little sharpness, no cheap excitement.',
    allowed: [...NOVA_PLAYFUL_BOUNDARY.allowed],
    forbidden: [...NOVA_PLAYFUL_BOUNDARY.forbidden]
  };
}

export function getDailyStanceCopy({ posture, locale = 'en', variant = 'standard', seed = '', changed = false, noActionDay = false }) {
  const lib = library(locale);
  const bucket = lib.dailyStance[normalizePosture(posture)];
  const selected = choose(bucket[variant] || bucket.standard, `${posture}:${variant}:${seed}`, bucket.standard[0]);
  const adjusted = noActionDay && normalizePosture(posture) !== 'ATTACK'
    ? choose(lib.noAction.completion, `no-action:${seed}`, selected)
    : selected;
  const prefix = changed
    ? normalizeNovaLocale(locale) === 'zh'
      ? '判断有更新。'
      : 'The view updated. '
    : '';
  return guard(`${prefix}${adjusted}`.trim(), bucket.standard[0]);
}

export function getTodayRiskCopy({ posture, locale = 'en', changed = false, seed = '' }) {
  const lib = library(locale);
  const bucket = lib.todayRisk[normalizePosture(posture)];
  return {
    label: bucket.label,
    explanation: guard(choose(bucket.explanation, `${posture}:explain:${seed}`, bucket.explanation[0]), bucket.explanation[0]),
    delta: guard(choose(changed ? bucket.deltaUp : bucket.deltaFlat, `${posture}:delta:${seed}`, (changed ? bucket.deltaUp : bucket.deltaFlat)[0]), (changed ? bucket.deltaUp : bucket.deltaFlat)[0])
  };
}

export function getMorningCheckCopy({ posture, status, locale = 'en', seed = '', changed = false, noActionDay = false }) {
  const lib = library(locale);
  const key = ['PENDING', 'REFRESH_REQUIRED', 'COMPLETED'].includes(String(status || '').toUpperCase())
    ? String(status).toUpperCase()
    : 'PENDING';
  const bucket = lib.morningCheck[key];
  return {
    title: bucket.title,
    short_label: bucket.shortLabel,
    headline: guard(choose(bucket.headline, `${key}:headline:${seed}`, bucket.headline[0]), bucket.headline[0]),
    prompt: guard(choose(bucket.prompt, `${key}:prompt:${seed}`, bucket.prompt[0]), bucket.prompt[0]),
    arrival_line: guard(choose(lib.morningArrival[normalizePosture(posture)], `${posture}:arrival:${seed}`, lib.morningArrival[normalizePosture(posture)][0]), ''),
    ritual_line: guard(choose(lib.morningRitual[normalizePosture(posture)], `${posture}:ritual:${seed}`, lib.morningRitual[normalizePosture(posture)][0]), ''),
    humor_line: guard(choose(lib.morningHumor[normalizePosture(posture)], `${posture}:humor:${seed}`, lib.morningHumor[normalizePosture(posture)][0]), ''),
    completion_feedback: guard(
      key === 'COMPLETED'
        ? choose(bucket.completion, `${key}:complete:${seed}`, bucket.completion[0])
        : noActionDay
          ? choose(lib.noAction.completion, `no-action:${seed}`, lib.noAction.completion[0])
          : choose(bucket.completion, `${key}:feedback:${seed}`, bucket.completion[0]),
      bucket.completion[0]
    ),
    cta_label: bucket.cta,
    ai_cta_label: bucket.aiCta,
    changed_line: changed
      ? normalizeNovaLocale(locale) === 'zh'
        ? '系统已经更新了判断，值得回来重新确认一次。'
        : 'The system updated the view. It is worth one more clean check.'
      : null
  };
}

export function getActionCardCopy({ posture, locale = 'en', seed = '', actionState = 'actionable' }) {
  const lib = library(locale);
  const normalized = normalizePosture(posture);
  return {
    title: lib.actionCard.title,
    risk_title: lib.actionCard.riskTitle,
    more_ranked_title: lib.actionCard.moreRanked,
    recent_signals_title: lib.actionCard.recentSignals,
    ask_nova_label: lib.actionCard.askNova,
    open_wrap_label: lib.actionCard.openWrap,
    why_now: guard(choose(lib.actionCard.whyNow[normalized], `${normalized}:why:${seed}`, lib.actionCard.whyNow[normalized][0]), lib.actionCard.whyNow[normalized][0]),
    caution: guard(choose(lib.actionCard.caution[normalized], `${normalized}:caution:${seed}`, lib.actionCard.caution[normalized][0]), lib.actionCard.caution[normalized][0]),
    invalidation: guard(
      actionState === 'watch-only'
        ? choose(lib.actionCard.invalidation.watchOnly, `${normalized}:invalidation:${seed}`, lib.actionCard.invalidation.watchOnly[0])
        : choose(lib.actionCard.invalidation.actionable, `${normalized}:invalidation:${seed}`, lib.actionCard.invalidation.actionable[0]),
      lib.actionCard.invalidation.actionable[0]
    ),
    badges: { ...lib.actionCard.badges }
  };
}

export function getNoActionCopy({ locale = 'en', seed = '', posture = 'WAIT' }) {
  const lib = library(locale);
  return {
    arrival: guard(choose(lib.noAction.arrival, `${posture}:arrival:${seed}`, lib.noAction.arrival[0]), lib.noAction.arrival[0]),
    completion: guard(choose(lib.noAction.completion, `${posture}:complete:${seed}`, lib.noAction.completion[0]), lib.noAction.completion[0]),
    wrap: guard(choose(lib.noAction.wrap, `${posture}:wrap:${seed}`, lib.noAction.wrap[0]), lib.noAction.wrap[0]),
    notify: guard(choose(lib.noAction.notify, `${posture}:notify:${seed}`, lib.noAction.notify[0]), lib.noAction.notify[0])
  };
}

export function getNotificationCopy({ category, posture, locale = 'en', triggerType = 'stable', seed = '', overlap = false }) {
  const lib = library(locale);
  const bucket = lib.notifications[String(category || 'RHYTHM').toUpperCase()] || lib.notifications.RHYTHM;
  if (String(category || '').toUpperCase() === 'STATE_SHIFT') {
    return {
      title: guard(choose(bucket.title, `${category}:title:${seed}`, bucket.title[0]), bucket.title[0]),
      body: guard(choose(bucket.body[triggerType] || bucket.body.stable, `${category}:body:${seed}`, (bucket.body[triggerType] || bucket.body.stable)[0]), (bucket.body[triggerType] || bucket.body.stable)[0])
    };
  }
  if (String(category || '').toUpperCase() === 'PROTECTIVE') {
    const bodyKey = overlap ? 'overlap' : normalizePosture(posture);
    return {
      title: guard(choose(bucket.title, `${category}:title:${seed}`, bucket.title[0]), bucket.title[0]),
      body: guard(choose(bucket.body[bodyKey] || bucket.body.DEFEND, `${category}:body:${seed}`, (bucket.body[bodyKey] || bucket.body.DEFEND)[0]), (bucket.body[bodyKey] || bucket.body.DEFEND)[0])
    };
  }
  const bodyBucket = bucket.body[normalizePosture(posture)] || bucket.body.WAIT;
  return {
    title: guard(choose(bucket.title, `${category}:title:${seed}`, bucket.title[0]), bucket.title[0]),
    body: guard(choose(bodyBucket, `${category}:body:${seed}`, bodyBucket[0]), bodyBucket[0])
  };
}

export function getWidgetCopy({ type, posture, locale = 'en', triggerType = 'stable', seed = '' }) {
  const lib = library(locale);
  if (type === 'change') {
    return {
      title: guard(choose(lib.widget.change[triggerType] || lib.widget.change.stable, `${type}:title:${seed}`, (lib.widget.change[triggerType] || lib.widget.change.stable)[0]), (lib.widget.change[triggerType] || lib.widget.change.stable)[0]),
      spark: guard(choose(lib.widget.spark[normalizePosture(posture)], `${type}:spark:${seed}`, lib.widget.spark[normalizePosture(posture)][0]), lib.widget.spark[normalizePosture(posture)][0])
    };
  }
  return {
    title: guard(choose(lib.widget.state[normalizePosture(posture)].title, `${type}:title:${seed}`, lib.widget.state[normalizePosture(posture)].title[0]), lib.widget.state[normalizePosture(posture)].title[0]),
    caption: guard(choose(lib.widget.state[normalizePosture(posture)].caption, `${type}:caption:${seed}`, lib.widget.state[normalizePosture(posture)].caption[0]), lib.widget.state[normalizePosture(posture)].caption[0]),
    spark: guard(choose(lib.widget.spark[normalizePosture(posture)], `${type}:spark:${seed}`, lib.widget.spark[normalizePosture(posture)][0]), lib.widget.spark[normalizePosture(posture)][0])
  };
}

export function getDisciplineCopy({ locale = 'en', score = 0, noActionDay = false, seed = '' }) {
  const lib = library(locale);
  const bucket = score >= 82 ? 'steady' : score >= 64 ? 'building' : 'early';
  return {
    summary: guard(choose(lib.discipline[bucket], `${bucket}:summary:${seed}`, lib.discipline[bucket][0]), lib.discipline[bucket][0]),
    no_action_value_line: noActionDay
      ? guard(choose(lib.discipline.noAction, `no-action:${seed}`, lib.discipline.noAction[0]), lib.discipline.noAction[0])
      : null,
    behavior_quality: bucket === 'steady' ? 'STEADY' : bucket === 'building' ? 'BUILDING' : 'EARLY'
  };
}

export function getWrapUpCopy({ locale = 'en', posture, ready, completed, seed = '', noActionDay = false }) {
  const lib = library(locale);
  return {
    title: lib.wrapUp.title,
    short_label: completed ? lib.wrapUp.shortDone : ready ? lib.wrapUp.shortReady : (normalizeNovaLocale(locale) === 'zh' ? '稍后' : 'Later'),
    headline: guard(
      completed
        ? choose(lib.wrapUp.headlineDone, `wrap:done:${seed}`, lib.wrapUp.headlineDone[0])
        : choose(lib.wrapUp.headlineReady, `wrap:ready:${seed}`, lib.wrapUp.headlineReady[0]),
      completed ? lib.wrapUp.headlineDone[0] : lib.wrapUp.headlineReady[0]
    ),
    opening_line: guard(choose(lib.wrapUp.opening[normalizePosture(posture)], `wrap:opening:${seed}`, lib.wrapUp.opening[normalizePosture(posture)][0]), lib.wrapUp.opening[normalizePosture(posture)][0]),
    completion_feedback: guard(choose(lib.wrapUp.completion, `wrap:complete:${seed}`, lib.wrapUp.completion[0]), lib.wrapUp.completion[0]),
    no_action_line: noActionDay ? guard(choose(lib.wrapUp.noAction, `wrap:no-action:${seed}`, lib.wrapUp.noAction[0]), lib.wrapUp.noAction[0]) : null
  };
}

export function getPerceptionLayerCopy({
  locale = 'en',
  posture,
  seed = '',
  status = 'arriving',
  changed = false,
  noActionDay = false
}) {
  const lib = library(locale);
  const normalized = normalizePosture(posture);
  const statusKey =
    status === 'anchored' ? 'anchored' : changed ? 'shifted' : 'arriving';
  const bucket = lib.perception[statusKey][normalized] || lib.perception.arriving[normalized];
  const focusBucket = noActionDay
    ? lib.perception.focus.noAction[normalized]
    : lib.perception.focus.actionable[normalized];
  const morning = getMorningCheckCopy({
    posture: normalized,
    status: statusKey === 'anchored' ? 'COMPLETED' : changed ? 'REFRESH_REQUIRED' : 'PENDING',
    locale,
    seed: `${seed}:perception`,
    changed,
    noActionDay
  });
  return {
    badge: lib.perception.badge,
    ambient_label: lib.perception.ambientLabel,
    headline: guard(choose(bucket, `${normalized}:perception:${statusKey}:${seed}`, bucket[0]), bucket[0]),
    focus_line: guard(choose(focusBucket, `${normalized}:perception:focus:${seed}`, focusBucket[0]), focusBucket[0]),
    confirmation_line: statusKey === 'anchored' ? morning.completion_feedback : morning.ritual_line,
    status: statusKey
  };
}

export function getAssistantVoiceGuide({ locale = 'en', posture = 'WAIT', userState = 'default' } = {}) {
  const lib = library(locale);
  const tone = postureTone(posture);
  const openerKey = tone === 'defensive' ? 'protective' : tone === 'opportunity' ? 'opportunity' : 'calm';
  return {
    opener: guard(choose(lib.assistant.opener[openerKey], `${openerKey}:${userState}`, lib.assistant.opener[openerKey][0]), lib.assistant.opener[openerKey][0]),
    risk_explain: guard(choose(lib.assistant.riskExplain, `risk:${userState}`, lib.assistant.riskExplain[0]), lib.assistant.riskExplain[0]),
    intercept: guard(choose(lib.assistant.intercept, `intercept:${userState}`, lib.assistant.intercept[0]), lib.assistant.intercept[0]),
    no_action: guard(choose(lib.assistant.noAction, `no-action:${userState}`, lib.assistant.noAction[0]), lib.assistant.noAction[0]),
    wrap: guard(choose(lib.assistant.wrap, `wrap:${userState}`, lib.assistant.wrap[0]), lib.assistant.wrap[0]),
    style_rules: normalizeNovaLocale(locale) === 'zh'
      ? ['冷静但不冰冷', '可以机灵，但不要油', '高风险时更像在按住用户的手']
      : ['calm but not cold', 'a little wit is fine, never cute', 'on high-risk days sound like you are slowing the user down']
  };
}

export function getUiRegimeTone({ posture, locale = 'en' }) {
  const normalized = normalizePosture(posture);
  const tone = postureTone(normalized);
  const widget = getWidgetCopy({ type: 'state', posture: normalized, locale, seed: `${normalized}:ui` });
  const noAction = getNoActionCopy({ locale, posture: normalized, seed: `${normalized}:ui` });
  const morning = getMorningCheckCopy({ posture: normalized, status: 'PENDING', locale, seed: `${normalized}:ui` });
  return {
    tone,
    accent: normalized === 'ATTACK' ? 'safe' : normalized === 'PROBE' ? 'medium' : normalized === 'DEFEND' ? 'caution' : 'neutral',
    label: widget.title,
    widget_label: widget.caption || widget.title,
    arrival_line: morning.arrival_line,
    ritual_line: morning.ritual_line,
    humor_line: morning.humor_line,
    completion_line: noAction.completion,
    protective_line: normalized === 'DEFEND' ? morning.humor_line : noAction.arrival,
    wrap_line: getWrapUpCopy({ locale, posture: normalized, ready: true, completed: false, seed: `${normalized}:ui`, noActionDay: normalized !== 'ATTACK' }).opening_line,
    motion_profile: NOVA_TONE_MATRIX[tone].motionTone,
    motion: {
      entry: normalized === 'ATTACK' ? 'clear' : normalized === 'PROBE' ? 'measured' : normalized === 'DEFEND' ? 'steady' : 'quiet',
      settle: normalized === 'ATTACK' ? 'confident' : normalized === 'PROBE' ? 'watchful' : normalized === 'DEFEND' ? 'guarded' : 'calm',
      emphasis: normalized === 'ATTACK' ? 'crisp' : normalized === 'PROBE' ? 'soft' : normalized === 'DEFEND' ? 'contained' : 'minimal',
      pulse: normalized === 'ATTACK' ? 'brief' : normalized === 'PROBE' ? 'gentle' : normalized === 'DEFEND' ? 'low' : 'none'
    }
  };
}

export function getPortfolioActionLabel(action, locale = 'en') {
  const zh = {
    open_new_risk: '开启新风险',
    add_on_strength: '顺势加一点',
    reduce_risk: '降低风险',
    hedge: '对冲 / 降风险',
    defensive_hold: '先守住',
    no_action: '先等待',
    watch_only: '仅观察'
  };
  const en = {
    open_new_risk: 'Open new risk',
    add_on_strength: 'Add on strength',
    reduce_risk: 'Reduce risk',
    hedge: 'Hedge / de-risk',
    defensive_hold: 'Defensive hold',
    no_action: 'Wait',
    watch_only: 'Watch only'
  };
  const table = normalizeNovaLocale(locale) === 'zh' ? zh : en;
  return table[action] || (normalizeNovaLocale(locale) === 'zh' ? '先确认' : 'Confirm first');
}

export function getCopyGuardrails(locale = 'en') {
  return {
    locale: normalizeNovaLocale(locale),
    banned_phrases: [...BANNED_PHRASES],
    rules: normalizeNovaLocale(locale) === 'zh'
      ? [
          '高风险日不得出现鼓励冒险或放大仓位的措辞。',
          '机会日也不能出现兴奋化、喊单式表达。',
          '通知不得带有营销 push 腔。',
          '无动作日必须给出完成感，而不是空白感。'
        ]
      : [
          'Never encourage oversized risk on defensive or wait days.',
          'Opportunity language must stay composed, never hyped.',
          'Notification language cannot drift into marketing push tone.',
          'No-action days must feel complete, not empty.'
        ]
  };
}
