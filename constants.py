class ApplicationStatus:
    APPLIED             = 'Applied'
    SHORTLISTED         = 'Shortlisted'
    INTERVIEW_SCHEDULED = 'Interview Scheduled'
    SELECTED            = 'Selected'
    REJECTED            = 'Rejected'
    PLACED              = 'Placed'

    ALL = [APPLIED, SHORTLISTED, INTERVIEW_SCHEDULED, SELECTED, REJECTED, PLACED]
    # Statuses a company can set; Placed is set via the Placement model, not directly
    VALID_TRANSITIONS = [APPLIED, SHORTLISTED, INTERVIEW_SCHEDULED, SELECTED, REJECTED]


class DriveStatus:
    PENDING  = 'Pending'
    APPROVED = 'Approved'
    REJECTED = 'Rejected'
    CLOSED   = 'Closed'


class ApprovalStatus:
    PENDING  = 'Pending'
    APPROVED = 'Approved'
    REJECTED = 'Rejected'


class InterviewStatus:
    SCHEDULED  = 'Scheduled'
    COMPLETED  = 'Completed'
    CANCELLED  = 'Cancelled'


class OfferStatus:
    PENDING  = 'Pending'
    ACCEPTED = 'Accepted'
    DECLINED = 'Declined'