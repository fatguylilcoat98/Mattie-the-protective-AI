/*
  Mattie — Confidence-Routed Intervention Layer
  Sophisticated multi-dimensional risk assessment for protective responses
  Built by Christopher Hughes · The Good Neighbor Guard
  Truth · Safety · We Got Your Back
*/

// Response intervention modes based on confidence scoring
const INTERVENTION_MODES = {
  NORMAL: 'normal',
  VERIFY: 'verify',
  ESCALATION: 'escalation',
  PROTECTION: 'protection'
};

// Multi-dimensional risk assessment framework
class ConfidenceInterventionEngine {

  // Analyze text across 8 risk dimensions with confidence scoring
  assessRisk(text, context = {}) {
    if (!text || typeof text !== 'string') {
      return this.createNormalResponse();
    }

    const textLower = text.toLowerCase();

    // Calculate confidence scores for each dimension (0.0 - 1.0)
    const scores = {
      scam_probability: this.assessScamProbability(textLower),
      coercion_probability: this.assessCoercionProbability(textLower),
      capacity_uncertainty: this.assessCapacityUncertainty(textLower, context),
      authority_conflict: this.assessAuthorityConflict(textLower, context),
      irreversibility_score: this.assessIrreversibility(textLower),
      evidence_quality: this.assessEvidenceQuality(textLower, context),
      urgency_pressure: this.assessUrgencyPressure(textLower),
      external_verifiability: this.assessExternalVerifiability(textLower, context)
    };

    // Determine intervention mode based on confidence thresholds
    const intervention = this.determineIntervention(scores);

    // Generate appropriate response
    const response = this.generateResponse(intervention, scores, textLower);

    return {
      mode: intervention.mode,
      confidence_scores: scores,
      combined_risk: intervention.risk,
      reasoning: intervention.reasoning,
      response: response,
      evidence_preserved: this.preserveEvidence(textLower, scores, intervention),
      escalation_suggested: intervention.mode === INTERVENTION_MODES.ESCALATION
    };
  }

  // Assess likelihood this is a scam (0.0 - 1.0)
  assessScamProbability(text) {
    const scamIndicators = [
      { pattern: /(gift card|itunes|google play|bitcoin|wire transfer)/g, weight: 0.4 },
      { pattern: /(you've won|lottery|prize|sweepstakes)/g, weight: 0.3 },
      { pattern: /(urgent|immediate|expires today|act now)/g, weight: 0.2 },
      { pattern: /(irs|social security|medicare.*suspended)/g, weight: 0.3 },
      { pattern: /(tech support|microsoft calling|virus detected)/g, weight: 0.3 },
      { pattern: /(refund|subscription.*cancel|processing fee)/g, weight: 0.25 }
    ];

    let probability = 0.0;
    const matches = [];

    scamIndicators.forEach(indicator => {
      const regex_matches = text.match(indicator.pattern);
      if (regex_matches) {
        probability = Math.min(1.0, probability + indicator.weight);
        matches.push({ type: 'scam_indicator', matches: regex_matches });
      }
    });

    return Math.min(1.0, probability);
  }

  // Assess likelihood of coercion or manipulation (0.0 - 1.0)
  assessCoercionProbability(text) {
    const coercionIndicators = [
      { pattern: /(don't tell|keep secret|between us|don't mention)/g, weight: 0.5 },
      { pattern: /(right now|can't wait|before.*expires)/g, weight: 0.3 },
      { pattern: /(trust me|you have to|no choice)/g, weight: 0.3 },
      { pattern: /(threatened|consequences|legal action)/g, weight: 0.4 },
      { pattern: /(love you|lonely|need help)/g, weight: 0.2 }
    ];

    return this.calculateIndicatorScore(text, coercionIndicators);
  }

  // Assess uncertainty about capacity/authorization (0.0 - 1.0)
  assessCapacityUncertainty(text, context) {
    const capacityIndicators = [
      { pattern: /(power of attorney|poa|legal guardian)/g, weight: -0.3 }, // These reduce uncertainty
      { pattern: /(doctor.*says|medical.*advice)/g, weight: -0.2 },
      { pattern: /(confused|don't understand|not sure)/g, weight: 0.4 },
      { pattern: /(someone told me|they said)/g, weight: 0.3 }
    ];

    let uncertainty = 0.3; // Base uncertainty level
    uncertainty += this.calculateIndicatorScore(text, capacityIndicators);

    // Context can modify uncertainty
    if (context.has_documentation) uncertainty -= 0.2;
    if (context.has_witness) uncertainty -= 0.1;

    return Math.max(0.0, Math.min(1.0, uncertainty));
  }

  // Assess conflicting authority claims (0.0 - 1.0)
  assessAuthorityConflict(text, context) {
    const authorityIndicators = [
      { pattern: /(chris|aubrey).*said/g, weight: 0.3 },
      { pattern: /(doctor|lawyer|bank).*told/g, weight: 0.2 },
      { pattern: /(government|official|agency)/g, weight: 0.3 },
      { pattern: /(family.*against|don't.*agree)/g, weight: 0.4 }
    ];

    return this.calculateIndicatorScore(text, authorityIndicators);
  }

  // Assess how irreversible the action would be (0.0 - 1.0)
  assessIrreversibility(text) {
    const irreversibilityIndicators = [
      { pattern: /(sell.*house|mortgage|deed)/g, weight: 0.9 },
      { pattern: /(life savings|all.*money|everything)/g, weight: 0.8 },
      { pattern: /(wire transfer|bitcoin|gift card)/g, weight: 0.7 },
      { pattern: /(sign.*papers|legal.*document)/g, weight: 0.5 },
      { pattern: /(delete|destroy|throw away)/g, weight: 0.4 }
    ];

    return this.calculateIndicatorScore(text, irreversibilityIndicators);
  }

  // Assess quality of supporting evidence (0.0 = poor, 1.0 = strong)
  assessEvidenceQuality(text, context) {
    const evidenceIndicators = [
      { pattern: /(doctor.*letter|medical.*record)/g, weight: 0.3 },
      { pattern: /(legal.*document|court.*order)/g, weight: 0.4 },
      { pattern: /(bank.*statement|official.*notice)/g, weight: 0.3 },
      { pattern: /(phone.*call|email.*said)/g, weight: -0.3 }, // Poor evidence
      { pattern: /(someone.*told|heard.*that)/g, weight: -0.2 }
    ];

    let quality = 0.5; // Neutral baseline
    quality += this.calculateIndicatorScore(text, evidenceIndicators);

    return Math.max(0.0, Math.min(1.0, quality));
  }

  // Assess urgency pressure tactics (0.0 - 1.0)
  assessUrgencyPressure(text) {
    const urgencyIndicators = [
      { pattern: /(today only|expires.*today|right now)/g, weight: 0.4 },
      { pattern: /(urgent|emergency|immediate)/g, weight: 0.3 },
      { pattern: /(last chance|limited time|act fast)/g, weight: 0.3 },
      { pattern: /(deadline|before.*close|must.*decide)/g, weight: 0.25 }
    ];

    return this.calculateIndicatorScore(text, urgencyIndicators);
  }

  // Assess how externally verifiable the claims are (0.0 = unverifiable, 1.0 = easily verified)
  assessExternalVerifiability(text, context) {
    const verifiabilityIndicators = [
      { pattern: /(call.*back|verify.*with|check.*website)/g, weight: 0.4 },
      { pattern: /(reference.*number|case.*number)/g, weight: 0.3 },
      { pattern: /(doctor.*office|bank.*branch)/g, weight: 0.3 },
      { pattern: /(secret|confidential|don't.*verify)/g, weight: -0.5 }
    ];

    let verifiability = 0.5; // Neutral baseline
    verifiability += this.calculateIndicatorScore(text, verifiabilityIndicators);

    return Math.max(0.0, Math.min(1.0, verifiability));
  }

  // Helper function to calculate weighted indicator scores
  calculateIndicatorScore(text, indicators) {
    let score = 0.0;
    indicators.forEach(indicator => {
      const matches = text.match(indicator.pattern);
      if (matches) {
        score += indicator.weight;
      }
    });
    return Math.max(0.0, Math.min(1.0, score));
  }

  // Determine intervention mode based on confidence scores
  determineIntervention(scores) {
    const {
      scam_probability,
      coercion_probability,
      capacity_uncertainty,
      authority_conflict,
      irreversibility_score,
      evidence_quality,
      urgency_pressure,
      external_verifiability
    } = scores;

    // Calculate combined risk assessment
    const protection_signals = scam_probability * 0.3 + coercion_probability * 0.2 + irreversibility_score * 0.2;
    const uncertainty_signals = capacity_uncertainty * 0.3 + authority_conflict * 0.2;
    const evidence_concerns = (1.0 - evidence_quality) * 0.2 + urgency_pressure * 0.2;

    const combined_risk = protection_signals + uncertainty_signals + evidence_concerns;

    // Determine intervention mode with reasoning
    if (scam_probability >= 0.90 || coercion_probability >= 0.90) {
      return {
        mode: INTERVENTION_MODES.PROTECTION,
        risk: combined_risk,
        reasoning: 'High confidence scam or coercion detected'
      };
    } else if (combined_risk >= 0.60) {
      return {
        mode: INTERVENTION_MODES.VERIFY,
        risk: combined_risk,
        reasoning: 'Significant risk signals require verification'
      };
    } else if (authority_conflict >= 0.75 || capacity_uncertainty >= 0.60 || evidence_quality <= 0.30) {
      return {
        mode: INTERVENTION_MODES.ESCALATION,
        risk: combined_risk,
        reasoning: 'Mixed signals require careful evaluation'
      };
    } else {
      return {
        mode: INTERVENTION_MODES.NORMAL,
        risk: combined_risk,
        reasoning: 'Low risk, normal supportive response appropriate'
      };
    }
  }

  // Generate appropriate response based on intervention mode
  generateResponse(intervention, scores, text) {
    switch (intervention.mode) {
      case INTERVENTION_MODES.PROTECTION:
        return this.generateProtectionResponse(scores);

      case INTERVENTION_MODES.VERIFY:
        return this.generateVerificationResponse(scores);

      case INTERVENTION_MODES.ESCALATION:
        return this.generateEscalationResponse(scores);

      case INTERVENTION_MODES.NORMAL:
      default:
        return this.generateNormalResponse();
    }
  }

  generateProtectionResponse(scores) {
    return {
      type: 'protection',
      message: "🛡️ Sandy, I'm very concerned about this. This shows strong signs of a scam or someone trying to pressure you. Please don't take any immediate action. Let's call Chris or Aubrey right away to talk through this together.",
      actions: ['contact_family', 'preserve_evidence', 'no_immediate_action']
    };
  }

  generateVerificationResponse(scores) {
    return {
      type: 'verification',
      message: "Sandy, this contains some concerning signals that make me want to slow down and verify a few things together. Before we proceed, let's independently confirm some details. Can we call the organization directly using a number we look up ourselves?",
      actions: ['independent_verification', 'preserve_evidence', 'slow_down']
    };
  }

  generateEscalationResponse(scores) {
    return {
      type: 'escalation',
      message: "This contains both concerning signals and potentially legitimate elements. I can't classify this as clearly safe or clearly dangerous. I'm entering careful evaluation mode. Let's preserve everything and get a second opinion before deciding.",
      actions: ['preserve_evidence', 'seek_second_opinion', 'careful_evaluation']
    };
  }

  generateNormalResponse() {
    return {
      type: 'normal',
      message: null, // No protective intervention needed
      actions: ['normal_support']
    };
  }

  createNormalResponse() {
    return {
      mode: INTERVENTION_MODES.NORMAL,
      confidence_scores: {},
      combined_risk: 0.0,
      reasoning: 'No text to analyze',
      response: this.generateNormalResponse(),
      evidence_preserved: null,
      escalation_suggested: false
    };
  }

  // Preserve evidence for review rather than jumping to conclusions
  preserveEvidence(text, scores, intervention) {
    return {
      original_text: text,
      timestamp: new Date().toISOString(),
      confidence_scores: scores,
      intervention_triggered: intervention.mode,
      reasoning: intervention.reasoning,
      preserved_for_review: intervention.mode !== INTERVENTION_MODES.NORMAL
    };
  }
}

module.exports = {
  ConfidenceInterventionEngine,
  INTERVENTION_MODES
};