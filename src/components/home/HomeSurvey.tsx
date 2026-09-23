import { useEffect, useRef, useState } from 'react';
import { HOME_SURVEY_KEY } from '../../lib/home-survey';

type Option = { optionId: string; label: string; percentage?: number };
type PollState = {
  survey: { _id: string; language: string; questions: { questionId: string; text: string; options: Option[] }[] };
  availability: { state: string; isOpen: boolean };
  responseState: { hasResponded: boolean };
  results?: { totalParticipants: number; options: Option[] };
};

export default function HomeSurvey({ lang = 'it' }: { lang?: string }) {
  const en = lang === 'en';
  const copy = en ? {
    poll: 'Poll', vote: 'Vote', loading: 'Loading poll…', sending: 'Sending vote…',
    thanks: 'Your vote has been recorded.', already: 'You have already voted.',
    error: 'The poll could not be loaded. Please try again.', retry: 'Try again',
    closed: 'This poll is closed.', participants: 'participants', participant: 'participant',
  } : {
    poll: 'Sondaggio', vote: 'Vota', loading: 'Caricamento sondaggio…', sending: 'Invio del voto…',
    thanks: 'Il tuo voto è stato registrato.', already: 'Hai già votato.',
    error: 'Impossibile caricare il sondaggio. Riprova.', retry: 'Riprova',
    closed: 'Questo sondaggio è chiuso.', participants: 'partecipanti', participant: 'partecipante',
  };
  const [poll, setPoll] = useState<PollState | null>(null);
  const [selection, setSelection] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const busy = useRef(false);
  const endpoint = `/api/community/surveys/${HOME_SURVEY_KEY}`;

  async function load(signal?: AbortSignal) {
    setLoading(true);
    setError(false);
    try {
      const response = await fetch(`${endpoint}?language=${en ? 'en' : 'it'}`, { credentials: 'same-origin', cache: 'no-store', signal });
      const data = await response.json();
      if (response.status === 404) { setUnavailable(true); return; }
      if (!response.ok || !data.ok) throw new Error('unavailable');
      if (data.availability.state === 'scheduled' || data.availability.state === 'draft') {
        setUnavailable(true); return;
      }
      setUnavailable(false);
      setPoll(data);
    } catch (cause) {
      if (!signal?.aborted) setError(true);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [lang]);

  async function vote(event: React.FormEvent) {
    event.preventDefault();
    if (busy.current || !selection || !poll || confirmed || poll.responseState.hasResponded || !poll.availability.isOpen) return;
    busy.current = true;
    setSending(true);
    setError(false);
    try {
      const response = await fetch(`${endpoint}/responses`, {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ surveyDocumentId: poll.survey._id, language: poll.survey.language,
          answers: [{ questionId: poll.survey.questions[0].questionId, optionId: selection }] }),
      });
      const data = await response.json();
      if (response.status === 409 && data.error === 'already_submitted') {
        setConfirmed(true);
        await load();
      } else if (response.status === 409 && ['survey_closed', 'survey_not_open'].includes(data.error)) {
        await load();
      } else {
        if (!response.ok || !data.ok) throw new Error('submit failed');
        setAccepted(true);
        setConfirmed(true);
        await load();
      }
    } catch { setError(true); }
    finally { busy.current = false; setSending(false); }
  }

  if (unavailable) return null;
  const question = poll?.survey.questions[0];
  const results = poll?.results;
  const completed = confirmed || poll?.responseState.hasResponded;
  const showVotingForm = question && !results && !completed && poll?.availability.isOpen;
  const message = sending ? copy.sending : loading ? copy.loading : error ? copy.error
    : accepted ? copy.thanks : poll?.availability.state === 'closed' ? copy.closed
    : completed ? copy.already : '';

  return <div className="rg-reviews__quick-poll" data-home-survey aria-busy={loading || sending}>
    <span className="rg-reviews__quick-poll-label">{copy.poll}</span>
    {question && !showVotingForm && <p id="quick-poll-question" className="rg-home-poll__question">{question.text}</p>}
    <p className="rg-home-poll__status" role="status" aria-live="polite" hidden={!message}>{message}</p>
    {error && <button className="rg-home-poll__retry" type="button" onClick={() => void load()} disabled={loading || sending}>{copy.retry}</button>}
    {showVotingForm && <form onSubmit={vote}>
      <fieldset className="rg-reviews__quick-poll-options" disabled={sending || loading || error}>
        <legend id="quick-poll-question" className="rg-home-poll__question">{question.text}</legend>
        {question.options.map(option => <label className="rg-reviews__quick-poll-option" key={option.optionId}>
          <input type="radio" name="home-survey-choice" value={option.optionId} checked={selection === option.optionId}
            onChange={() => setSelection(option.optionId)} />
          <span>{option.label}</span>
        </label>)}
      </fieldset>
      <button type="submit" className="rg-reviews__participation-cta rg-cta-filled-raised rg-cta-filled-raised--primary"
        disabled={!selection || sending || loading || error}>
        <span className="rg-cta-filled-raised__face">{sending ? copy.sending : copy.vote}</span>
      </button>
    </form>}
    {results && <div className="rg-home-poll__results" aria-labelledby="quick-poll-question">
      {results.options.map(option => <div className="rg-home-poll__result" key={option.optionId}>
        <div><span>{option.label}</span><strong>{option.percentage}%</strong></div>
        <div className="rg-home-poll__track" aria-hidden="true"><span style={{ width: `${option.percentage}%` }} /></div>
      </div>)}
      <p>{results.totalParticipants} {results.totalParticipants === 1 ? copy.participant : copy.participants}</p>
    </div>}
  </div>;
}
